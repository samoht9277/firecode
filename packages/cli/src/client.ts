import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { SERVER_STATE_PATH, startServer } from "@firecode/server";
import type { ServerState } from "@firecode/server";

export class FirecodeClient {
  private baseUrl: string;

  constructor(port: number) {
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  static async connect(): Promise<FirecodeClient> {
    let raw: string;
    try {
      raw = await readFile(SERVER_STATE_PATH, "utf-8");
    } catch {
      // Auto-start: server not running, start it in headless mode
      console.error("Firecode server not running, starting in headless mode...");
      const child = execFile(
        process.argv[0],
        [process.argv[1], "start", "--headless"],
        { detached: true, stdio: "ignore" },
      );
      child.unref();
      // Wait for server to come up
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          raw = await readFile(SERVER_STATE_PATH, "utf-8");
          break;
        } catch {}
      }
      if (!raw!) {
        throw new Error("Failed to auto-start firecode server.");
      }
    }

    const state: ServerState = JSON.parse(raw);
    const client = new FirecodeClient(state.httpPort);
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
    const res = await fetch(`${this.baseUrl}${path}`, init);
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
