export interface ServerState {
  httpPort: number;
  pid: number;
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
  | "wait-idle";

export interface ActionRequest {
  action: ActionType;
  args: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface RefMap {
  refs: Map<string, { role: string; name: string; nth?: number }>;
  timestamp: number;
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

export const SERVER_STATE_PATH = `${process.env.HOME}/.firecode/server.json`;
export const FIRECODE_DIR = `${process.env.HOME}/.firecode`;
