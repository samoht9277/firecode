import type { Page, Locator } from "playwright";

export interface ServerState {
  wsEndpoint: string;
  httpPort: number;
  pid: number;
}

export interface PageInfo {
  name: string;
  url: string;
  title: string;
}

export interface SnapshotResult {
  snapshot: string;
  refCount: number;
}

export type ActionType =
  | "navigate"
  | "click"
  | "fill"
  | "select"
  | "type"
  | "wait"
  | "hover";

export interface ActionRequest {
  action: ActionType;
  args: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface RefMap {
  refs: Map<string, { role: string; name: string }>;
  timestamp: number;
}

export const SERVER_STATE_PATH = `${process.env.HOME}/.firecode/server.json`;
export const FIRECODE_DIR = `${process.env.HOME}/.firecode`;
