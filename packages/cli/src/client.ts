import { readFile } from "node:fs/promises";

interface ServerState {
  wsEndpoint: string;
  httpPort: number;
  pid: number;
}

const SERVER_STATE_PATH = `${process.env.HOME}/.firecode/server.json`;

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
      throw new Error(
        "Firecode server is not running. Start it with: firecode start"
      );
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

  async get(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `HTTP ${res.status}`);
    }
    return res.json();
  }

  async post(path: string, body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? `HTTP ${res.status}`);
    }
    return res.json();
  }

  async del(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? `HTTP ${res.status}`);
    }
    return res.json();
  }
}
