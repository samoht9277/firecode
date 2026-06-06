import { firefox } from "playwright";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createApp } from "./api.js";
import { PageManager } from "./pages.js";
import { FIRECODE_DIR, getInstanceName, getServerStatePath } from "./types.js";
import type { ServerState } from "./types.js";

export { PageManager } from "./pages.js";
export { getSnapshot, resolveRef } from "./snapshot.js";
export { createApp } from "./api.js";
export {
  SERVER_STATE_PATH,
  FIRECODE_DIR,
  getInstanceName,
  getServerStatePath,
} from "./types.js";
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
  const instance = getInstanceName();
  const statePath = getServerStatePath(instance);
  const label = instance === "default" ? "" : ` [${instance}]`;

  // Clean up stale state file from a crashed/killed server
  try {
    const raw = await readFile(statePath, "utf-8");
    const old: ServerState = JSON.parse(raw);
    try {
      process.kill(old.pid, 0); // check if process exists
      console.error(
        `Firecode${label} server already running (PID ${old.pid}). Run: firecode stop`,
      );
      process.exit(1);
    } catch {
      await rm(statePath);
      console.log("Cleaned up stale state file from previous session.");
    }
  } catch {}

  console.log(`Launching Firefox${label} (${headless ? "headless" : "headed"})...`);

  const browser = await firefox.launch({
    headless,
    firefoxUserPrefs: {
      "dom.webdriver.enabled": false,
      "marionette.enabled": false,
    },
  });

  const pageManager = new PageManager();
  pageManager.setBrowser(browser);

  const authToken = randomUUID();
  const app = createApp(pageManager, authToken);
  const address = await app.listen({ port, host: "127.0.0.1" });
  const httpPort = parseInt(new URL(address).port, 10);
  console.log(`HTTP API listening on ${address}`);

  // Record this bundle's path + mtime so the CLI can detect a stale server
  // (i.e. the code was rebuilt after this server started).
  const buildPath = fileURLToPath(import.meta.url);
  let buildMtime = 0;
  try {
    buildMtime = statSync(buildPath).mtimeMs;
  } catch {}

  await mkdir(FIRECODE_DIR, { recursive: true });
  const state: ServerState = {
    httpPort,
    pid: process.pid,
    authToken,
    buildPath,
    buildMtime,
  };
  await writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(`State written to ${statePath}`);
  console.log(`Firecode${label} server running. Press Ctrl+C to stop.`);

  const cleanup = async () => {
    console.log("\nShutting down...");
    await pageManager.closeAll();
    await app.close();
    await browser.close();
    try {
      await rm(statePath);
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
