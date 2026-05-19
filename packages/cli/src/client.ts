import { readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";

function getInstanceName(): string {
  return process.env.FIRECODE_INSTANCE || "default";
}

function getStatePath(): string {
  const name = getInstanceName();
  const filename = name === "default" ? "server.json" : `server-${name}.json`;
  return `${process.env.HOME}/.firecode/${filename}`;
}

interface ServerState {
  httpPort: number;
  pid: number;
  authToken: string;
}

export class FirecodeClient {
  private baseUrl: string;
  private authToken: string;

  constructor(port: number, authToken: string) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.authToken = authToken;
  }

  static async connect(): Promise<FirecodeClient> {
    let raw: string | undefined;
    try {
      raw = await readFile(getStatePath(), "utf-8");

      // Check if PID is alive — if not, clean up stale state file
      const state: ServerState = JSON.parse(raw);
      try {
        process.kill(state.pid, 0);
      } catch {
        await rm(getStatePath()).catch(() => {});
        raw = undefined;
      }
    } catch {}

    if (!raw) {
      console.error("Firecode server not running, starting in headless mode...");
      const child = execFile(
        process.argv[0],
        [process.argv[1], "start", "--headless"],
        { detached: true, stdio: "ignore" },
      );
      child.unref();
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          raw = await readFile(getStatePath(), "utf-8");
          break;
        } catch {}
      }
      if (!raw) {
        throw new Error("Failed to auto-start firecode server.");
      }
    }

    const state: ServerState = JSON.parse(raw);
    const client = new FirecodeClient(state.httpPort, state.authToken);
    try {
      await client.get("/status");
    } catch {
      throw new Error(
        "Firecode server state file exists but server is not responding. Try: firecode stop && firecode start"
      );
    }

    return client;
  }

  private async request(path: string, init?: RequestInit): Promise<any> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${this.authToken}`);
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? `HTTP ${res.status}`);
    }
    return res.json();
  }

  async get(path: string): Promise<any> {
    return this.request(path);
  }

  async post(path: string, body?: any): Promise<any> {
    const options: RequestInit = { method: "POST" };
    if (body) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }
    return this.request(path, options);
  }

  async del(path: string): Promise<any> {
    return this.request(path, { method: "DELETE" });
  }
}
