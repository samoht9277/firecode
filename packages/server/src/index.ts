import { firefox } from "playwright";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createApp } from "./api.js";
import { PageManager } from "./pages.js";
import { SERVER_STATE_PATH, FIRECODE_DIR } from "./types.js";
import type { ServerState } from "./types.js";

export { PageManager } from "./pages.js";
export { getSnapshot, resolveRef } from "./snapshot.js";
export { createApp } from "./api.js";
export { SERVER_STATE_PATH, FIRECODE_DIR } from "./types.js";
export type {
  ServerState,
  PageInfo,
  ActionType,
  ActionRequest,
  ActionResult,
  RefMap,
  ConsoleEntry,
  NetworkEntry,
} from "./types.js";

export interface StartServerOptions {
  headless?: boolean;
  port?: number;
}

export async function startServer(
  options: StartServerOptions = {},
): Promise<void> {
  const headless = options.headless ?? false;
  const port = options.port ?? 0;

  // Clean up stale state file from a crashed/killed server
  try {
    const raw = await readFile(SERVER_STATE_PATH, "utf-8");
    const old: ServerState = JSON.parse(raw);
    try {
      process.kill(old.pid, 0); // check if process exists
      console.error(`Firecode server already running (PID ${old.pid}). Run: firecode stop`);
      process.exit(1);
    } catch {
      // Process doesn't exist, stale file — clean it up
      await rm(SERVER_STATE_PATH);
      console.log("Cleaned up stale state file from previous session.");
    }
  } catch {}

  console.log(`Launching Firefox (${headless ? "headless" : "headed"})...`);

  const browser = await firefox.launch({
    headless,
    firefoxUserPrefs: {
      "dom.webdriver.enabled": false,
      "marionette.enabled": false,
    },
  });

  // Don't create a context here — PageManager creates it lazily on first page,
  // so no blank window appears until you actually navigate somewhere.
  const pageManager = new PageManager();
  pageManager.setBrowser(browser);

  const authToken = randomUUID();
  const app = createApp(pageManager, authToken);
  const address = await app.listen({ port, host: "127.0.0.1" });
  const httpPort = parseInt(new URL(address).port, 10);
  console.log(`HTTP API listening on ${address}`);

  await mkdir(FIRECODE_DIR, { recursive: true });
  const state: ServerState = {
    httpPort,
    pid: process.pid,
    authToken,
  };
  await writeFile(SERVER_STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`State written to ${SERVER_STATE_PATH}`);
  console.log("Firecode server running. Press Ctrl+C to stop.");

  const cleanup = async () => {
    console.log("\nShutting down...");
    await pageManager.closeAll();
    await app.close();
    await browser.close();
    try {
      await rm(SERVER_STATE_PATH);
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  browser.on("disconnected", () => {
    console.error("Browser disconnected unexpectedly");
    cleanup();
  });
}
