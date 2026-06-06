export interface ServerState {
  httpPort: number;
  pid: number;
  authToken: string;
  buildPath: string;
  buildMtime: number;
}

export interface PageInfo {
  name: string;
  url: string;
  title: string;
}

export type ActionType =
  | "navigate"
  | "click"
  | "fill"
  | "select"
  | "type"
  | "wait"
  | "hover"
  | "evaluate"
  | "scroll"
  | "wait-for"
  | "reload"
  | "back"
  | "forward"
  | "keyboard"
  | "viewport"
  | "click-text"
  | "assert-text"
  | "wait-idle"
  | "find-text";

export interface ActionRequest {
  action: ActionType;
  args: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface RefMap {
  refs: Map<string, { role: string; name: string; nth: number }>;
  timestamp: number;
  frame?: string;
}

export interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: number;
}

export interface NetworkEntry {
  status: number;
  method: string;
  url: string;
  timestamp: number;
}

export const FIRECODE_DIR = `${process.env.HOME}/.firecode`;

export function getInstanceName(): string {
  return process.env.FIRECODE_INSTANCE || "default";
}

export function getServerStatePath(instance?: string): string {
  const name = instance ?? getInstanceName();
  const filename = name === "default" ? "server.json" : `server-${name}.json`;
  return `${FIRECODE_DIR}/${filename}`;
}

// Backwards-compatible: resolves to the current instance's state path.
// Prefer getServerStatePath() in new code.
export const SERVER_STATE_PATH = getServerStatePath();
