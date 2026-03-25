import { firefox } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createApp } from "./api.js";
import { PageManager } from "./pages.js";
import { SERVER_STATE_PATH, FIRECODE_DIR } from "./types.js";
import type { ServerState } from "./types.js";

export { PageManager } from "./pages.js";
export { getSnapshot, resolveRef } from "./snapshot.js";
export { createApp } from "./api.js";
export type {
  ServerState,
  PageInfo,
  SnapshotResult,
  ActionType,
  ActionRequest,
  ActionResult,
  RefMap,
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

  console.log(`Launching Firefox (${headless ? "headless" : "headed"})...`);

  // Use launch() directly instead of launchServer()+connect()
  // so we control the single browser instance and its contexts
  const browser = await firefox.launch({
    headless,
    firefoxUserPrefs: {
      "dom.webdriver.enabled": false,
      "marionette.enabled": false,
    },
  });

  // Create a single context — one OS window, all pages become tabs
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  const pageManager = new PageManager();
  pageManager.setContext(context);

  const app = createApp(pageManager);
  const address = await app.listen({ port, host: "127.0.0.1" });
  const httpPort = parseInt(new URL(address).port, 10);
  console.log(`HTTP API listening on ${address}`);

  await mkdir(FIRECODE_DIR, { recursive: true });
  const state: ServerState = {
    wsEndpoint: "",
    httpPort,
    pid: process.pid,
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
