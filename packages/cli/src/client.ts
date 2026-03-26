import { readFile } from "node:fs/promises";
import { SERVER_STATE_PATH } from "@firecode/server";
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
