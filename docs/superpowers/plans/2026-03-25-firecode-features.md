# Firecode Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add new browse actions (evaluate, scroll, wait-for, reload, back/forward, --force), observability commands (console, network, text, screenshot diff), and Phase 2 test mode to firecode.

**Architecture:** Extends the existing HTTP API pattern — new actions go into the server's action switch, new commands get CLI handlers that call the API. Console/network capture is done via Playwright event listeners attached in PageManager when pages are created. Test mode adds a new `testgen` package that parses git diffs, generates Playwright test files, and runs them.

**Tech Stack:** Playwright (Firefox), Fastify, Commander.js, simple-git (testgen), pnpm monorepo

---

## File Structure

```
packages/server/src/
  types.ts          — add new action types, ConsoleEntry, NetworkEntry
  pages.ts          — add console/network buffers, attach listeners on page create
  api.ts            — new action cases, new GET endpoints for text/console/network, screenshot diff
  snapshot.ts       — unchanged

packages/cli/src/
  index.ts          — register new commands
  commands/
    browse.ts       — add --force parsing, add new actions to valid list
    screenshot.ts   — add --diff flag
    text.ts         — NEW: text command
    console.ts      — NEW: console command
    network.ts      — NEW: network command
    test.ts         — NEW: test command

packages/testgen/
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    index.ts        — re-exports
    diff.ts         — git diff parsing
    analyze.ts      — categorize changed files
    plan.ts         — generate test plan
    generate.ts     — produce .spec.ts files
    run.ts          — execute tests, collect results

skills/firecode/
  SKILL.md          — updated with all new commands
```

---

### Task 1: Types + PageManager Console/Network Buffers

**Files:**
- Modify: `packages/server/src/types.ts`
- Modify: `packages/server/src/pages.ts`

- [ ] **Step 1: Add new types**

Replace the full content of `packages/server/src/types.ts`:

```typescript
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
  | "hover"
  | "evaluate"
  | "scroll"
  | "wait-for"
  | "reload"
  | "back"
  | "forward";

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
```

- [ ] **Step 2: Update PageManager with console/network buffers**

Replace the full content of `packages/server/src/pages.ts`:

```typescript
import type { BrowserContext, Page } from "playwright";
import type { PageInfo, RefMap, ConsoleEntry, NetworkEntry } from "./types.js";

interface PageEntry {
  page: Page;
  refMap: RefMap;
  consoleLogs: ConsoleEntry[];
  networkLogs: NetworkEntry[];
}

export class PageManager {
  private pages = new Map<string, PageEntry>();
  private context: BrowserContext | null = null;

  setContext(context: BrowserContext): void {
    this.context = context;
  }

  private attachListeners(page: Page, entry: PageEntry): void {
    page.on("console", (msg) => {
      entry.consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    page.on("response", (res) => {
      entry.networkLogs.push({
        status: res.status(),
        method: res.request().method(),
        url: res.url(),
        timestamp: Date.now(),
      });
    });
  }

  async createPage(name: string): Promise<PageInfo> {
    if (this.pages.has(name)) {
      const existing = this.pages.get(name)!;
      return {
        name,
        url: existing.page.url(),
        title: await existing.page.title(),
      };
    }

    if (!this.context) {
      throw new Error("Browser not connected");
    }

    const existingPages = this.context.pages();
    const blankPage = existingPages.find(
      (p) => p.url() === "about:blank" || p.url() === "",
    );

    let page: Page;
    if (blankPage) {
      page = blankPage;
    } else if (existingPages.length > 0) {
      const [newPage] = await Promise.all([
        this.context.waitForEvent("page"),
        existingPages[existingPages.length - 1].evaluate(() =>
          window.open("about:blank"),
        ),
      ]);
      page = newPage;
    } else {
      page = await this.context.newPage();
    }

    const entry: PageEntry = {
      page,
      refMap: { refs: new Map(), timestamp: 0 },
      consoleLogs: [],
      networkLogs: [],
    };
    this.attachListeners(page, entry);
    this.pages.set(name, entry);

    return { name, url: page.url(), title: await page.title() };
  }

  getPage(name: string): Page {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(
        `Page "${name}" not found. Use "firecode browse ${name} navigate <url>" to create it.`,
      );
    }
    return entry.page;
  }

  getRefMap(name: string): RefMap {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found`);
    }
    return entry.refMap;
  }

  setRefMap(name: string, refMap: RefMap): void {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found`);
    }
    entry.refMap = refMap;
  }

  getConsoleLogs(name: string, clear: boolean): ConsoleEntry[] {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found`);
    }
    const logs = [...entry.consoleLogs];
    if (clear) entry.consoleLogs = [];
    return logs;
  }

  getNetworkLogs(name: string, clear: boolean): NetworkEntry[] {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found`);
    }
    const logs = [...entry.networkLogs];
    if (clear) entry.networkLogs = [];
    return logs;
  }

  async listPages(): Promise<PageInfo[]> {
    const result: PageInfo[] = [];
    for (const [name, entry] of this.pages) {
      result.push({
        name,
        url: entry.page.url(),
        title: await entry.page.title(),
      });
    }
    return result;
  }

  async closePage(name: string): Promise<void> {
    const entry = this.pages.get(name);
    if (!entry) return;
    await entry.page.close();
    this.pages.delete(name);
  }

  async closeAll(): Promise<void> {
    for (const name of this.pages.keys()) {
      await this.closePage(name);
    }
  }
}
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build`
Expected: both packages build successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/types.ts packages/server/src/pages.ts
git commit -m "add console/network buffers and new action types"
```

---

### Task 2: New Server Actions (evaluate, scroll, wait-for, reload, back, forward, --force)

**Files:**
- Modify: `packages/server/src/api.ts`

- [ ] **Step 1: Replace api.ts with all new actions**

Replace the full content of `packages/server/src/api.ts`:

```typescript
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { PageManager } from "./pages.js";
import { getSnapshot, resolveRef } from "./snapshot.js";
import type { ActionRequest } from "./types.js";

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function cleanArgs(args: string[]): string[] {
  return args.filter(
    (a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") === false,
  );
}

export function createApp(pageManager: PageManager) {
  const app = Fastify({ logger: false });

  // Health check
  app.get("/status", async () => {
    const pages = await pageManager.listPages();
    return { ok: true, pages: pages.length, pageList: pages };
  });

  // List pages
  app.get("/pages", async () => {
    return await pageManager.listPages();
  });

  // Create page
  app.post<{ Body: { name: string } }>("/pages", async (req) => {
    const { name } = req.body;
    return await pageManager.createPage(name);
  });

  // Get snapshot
  app.get<{ Params: { name: string } }>(
    "/pages/:name/snapshot",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const result = await getSnapshot(page);
      pageManager.setRefMap(req.params.name, result.refMap);
      return { snapshot: result.snapshot, refCount: result.refMap.refs.size };
    },
  );

  // Get text content
  app.get<{ Params: { name: string } }>(
    "/pages/:name/text",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const text = await page.innerText("body");
      return { text };
    },
  );

  // Get console logs
  app.get<{ Params: { name: string }; Querystring: { clear?: string } }>(
    "/pages/:name/console",
    async (req) => {
      const clear = req.query.clear === "true";
      const logs = pageManager.getConsoleLogs(req.params.name, clear);
      return { logs };
    },
  );

  // Get network logs
  app.get<{
    Params: { name: string };
    Querystring: { all?: string; clear?: string };
  }>("/pages/:name/network", async (req) => {
    const showAll = req.query.all === "true";
    const clear = req.query.clear === "true";
    let logs = pageManager.getNetworkLogs(req.params.name, clear);
    if (!showAll) {
      logs = logs.filter((entry) => entry.status >= 400);
    }
    return { logs };
  });

  // Screenshot
  app.post<{
    Params: { name: string };
    Body: { path?: string; diff?: string };
  }>("/pages/:name/screenshot", async (req) => {
    const page = pageManager.getPage(req.params.name);
    const screenshotPath =
      req.body?.path ?? `/tmp/firecode-screenshot-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (req.body?.diff) {
      const baselinePath = req.body.diff;
      const [baseline, current] = await Promise.all([
        readFile(baselinePath),
        readFile(screenshotPath),
      ]);

      if (baseline.length !== current.length) {
        const diffPercent = 100;
        return {
          ok: true,
          path: screenshotPath,
          diff: {
            changed: true,
            percent: diffPercent,
            message: `Changed: images have different sizes (baseline: ${baseline.length} bytes, current: ${current.length} bytes)`,
          },
        };
      }

      let diffPixels = 0;
      const totalBytes = baseline.length;
      for (let i = 0; i < totalBytes; i++) {
        if (baseline[i] !== current[i]) diffPixels++;
      }
      const diffPercent = parseFloat(
        ((diffPixels / totalBytes) * 100).toFixed(2),
      );

      return {
        ok: true,
        path: screenshotPath,
        diff: {
          changed: diffPercent > 0,
          percent: diffPercent,
          message:
            diffPercent > 0
              ? `Changed: ${diffPercent}% of bytes differ`
              : "No changes detected",
        },
      };
    }

    return { ok: true, path: screenshotPath };
  });

  // Execute action
  app.post<{ Params: { name: string }; Body: ActionRequest }>(
    "/pages/:name/action",
    async (req) => {
      const { action, args } = req.body;
      const page = pageManager.getPage(req.params.name);
      const refMap = pageManager.getRefMap(req.params.name);
      const force = hasFlag(args, "--force");

      switch (action) {
        case "navigate": {
          const url = args[0];
          if (!url) throw new Error("navigate requires a URL");
          await page.goto(url, { waitUntil: "domcontentloaded" });
          return { ok: true, message: `Navigated to ${url}` };
        }
        case "click": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.click({ force });
          return { ok: true, message: `Clicked ${args[0]}` };
        }
        case "fill": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.fill(args[1] ?? "", { force });
          return {
            ok: true,
            message: `Filled ${args[0]} with "${args[1]}"`,
          };
        }
        case "select": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.selectOption(args[1] ?? "", { force });
          return {
            ok: true,
            message: `Selected "${args[1]}" on ${args[0]}`,
          };
        }
        case "type": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.pressSequentially(args[1] ?? "", { delay: 50 });
          return {
            ok: true,
            message: `Typed "${args[1]}" into ${args[0]}`,
          };
        }
        case "hover": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.hover({ force });
          return { ok: true, message: `Hovered ${args[0]}` };
        }
        case "wait": {
          const ms = parseInt(args[0] ?? "1000", 10);
          await page.waitForTimeout(ms);
          return { ok: true, message: `Waited ${ms}ms` };
        }
        case "evaluate": {
          const js = args[0];
          if (!js) throw new Error("evaluate requires a JS expression");
          const result = await page.evaluate(js);
          return {
            ok: true,
            message: JSON.stringify(result, null, 2) ?? "undefined",
          };
        }
        case "scroll": {
          const target = args[0];
          if (!target) throw new Error("scroll requires down, up, or a ref");
          if (target === "down") {
            await page.evaluate(() =>
              window.scrollBy(0, window.innerHeight),
            );
            return { ok: true, message: "Scrolled down" };
          }
          if (target === "up") {
            await page.evaluate(() =>
              window.scrollBy(0, -window.innerHeight),
            );
            return { ok: true, message: "Scrolled up" };
          }
          const locator = resolveRef(page, refMap, target);
          await locator.scrollIntoViewIfNeeded();
          return {
            ok: true,
            message: `Scrolled to ${target}`,
          };
        }
        case "wait-for": {
          const text = args[0];
          if (!text)
            throw new Error("wait-for requires text or --selector");
          const timeout = parseInt(
            getFlagValue(args, "--timeout") ?? "10000",
            10,
          );
          if (hasFlag(args, "--selector")) {
            await page.waitForSelector(text, { timeout });
            return {
              ok: true,
              message: `Selector "${text}" appeared`,
            };
          }
          await page.getByText(text).waitFor({ timeout });
          return {
            ok: true,
            message: `Text "${text}" appeared`,
          };
        }
        case "reload": {
          await page.reload({ waitUntil: "domcontentloaded" });
          return {
            ok: true,
            message: `Reloaded, now at ${page.url()}`,
          };
        }
        case "back": {
          await page.goBack({ waitUntil: "domcontentloaded" });
          return {
            ok: true,
            message: `Went back, now at ${page.url()}`,
          };
        }
        case "forward": {
          await page.goForward({ waitUntil: "domcontentloaded" });
          return {
            ok: true,
            message: `Went forward, now at ${page.url()}`,
          };
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  );

  // Close page
  app.delete<{ Params: { name: string } }>("/pages/:name", async (req) => {
    await pageManager.closePage(req.params.name);
    return { ok: true, message: `Closed page "${req.params.name}"` };
  });

  // Shutdown
  app.post("/shutdown", async () => {
    setTimeout(async () => {
      await pageManager.closeAll();
      process.exit(0);
    }, 100);
    return { ok: true, message: "Shutting down" };
  });

  return app;
}
```

- [ ] **Step 2: Update server index.ts exports**

Add to `packages/server/src/index.ts` exports:

```typescript
export type {
  ServerState,
  PageInfo,
  SnapshotResult,
  ActionType,
  ActionRequest,
  ActionResult,
  RefMap,
  ConsoleEntry,
  NetworkEntry,
} from "./types.js";
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build`
Expected: both packages build successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/api.ts packages/server/src/index.ts
git commit -m "add evaluate, scroll, wait-for, reload, back/forward actions and --force flag"
```

---

### Task 3: CLI — Updated browse + new text/console/network commands

**Files:**
- Modify: `packages/cli/src/commands/browse.ts`
- Modify: `packages/cli/src/commands/screenshot.ts`
- Create: `packages/cli/src/commands/text.ts`
- Create: `packages/cli/src/commands/console.ts`
- Create: `packages/cli/src/commands/network.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Update browse.ts with new actions and --force**

Replace `packages/cli/src/commands/browse.ts`:

```typescript
import { FirecodeClient } from "../client.js";

const VALID_ACTIONS = [
  "navigate", "click", "fill", "select", "type", "wait", "hover",
  "evaluate", "scroll", "wait-for", "reload", "back", "forward",
] as const;

export async function browseCommand(
  pageName: string,
  action: string,
  args: string[],
  options: { force?: boolean }
): Promise<void> {
  if (!VALID_ACTIONS.includes(action as any)) {
    console.error(
      `Unknown action "${action}". Valid actions: ${VALID_ACTIONS.join(", ")}`
    );
    process.exit(1);
  }

  try {
    const client = await FirecodeClient.connect();

    if (action === "navigate") {
      await client.post("/pages", { name: pageName });
    }

    const fullArgs = options.force ? [...args, "--force"] : args;

    const result = await client.post(`/pages/${pageName}/action`, {
      action,
      args: fullArgs,
    });

    console.log(result.message);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Update screenshot.ts with --diff**

Replace `packages/cli/src/commands/screenshot.ts`:

```typescript
import { FirecodeClient } from "../client.js";

export async function screenshotCommand(
  pageName: string,
  path?: string,
  options?: { diff?: string }
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const body: any = {};
    if (path) body.path = path;
    if (options?.diff) body.diff = options.diff;

    const result = await client.post(`/pages/${pageName}/screenshot`, body);

    if (result.diff) {
      console.log(result.diff.message);
      console.log(`Screenshot: ${result.path}`);
    } else {
      console.log(result.path);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Create text.ts**

Create `packages/cli/src/commands/text.ts`:

```typescript
import { FirecodeClient } from "../client.js";

export async function textCommand(pageName: string): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.get(`/pages/${pageName}/text`);
    console.log(result.text);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Create console.ts**

Create `packages/cli/src/commands/console.ts`:

```typescript
import { FirecodeClient } from "../client.js";

export async function consoleCommand(
  pageName: string,
  options: { clear?: boolean }
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const clear = options.clear ? "true" : "false";
    const result = await client.get(
      `/pages/${pageName}/console?clear=${clear}`
    );

    if (result.logs.length === 0) {
      console.log("No console messages.");
      return;
    }

    for (const entry of result.logs) {
      const type = entry.type.toUpperCase().padEnd(7);
      console.log(`[${type}] ${entry.text}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Create network.ts**

Create `packages/cli/src/commands/network.ts`:

```typescript
import { FirecodeClient } from "../client.js";

export async function networkCommand(
  pageName: string,
  options: { all?: boolean; clear?: boolean }
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const all = options.all ? "true" : "false";
    const clear = options.clear ? "true" : "false";
    const result = await client.get(
      `/pages/${pageName}/network?all=${all}&clear=${clear}`
    );

    if (result.logs.length === 0) {
      console.log(options.all ? "No network requests." : "No failed requests.");
      return;
    }

    for (const entry of result.logs) {
      console.log(`[${entry.status}] ${entry.method} ${entry.url}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 6: Update CLI index.ts with all new commands**

Replace `packages/cli/src/index.ts`:

```typescript
import { Command } from "commander";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { browseCommand } from "./commands/browse.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { screenshotCommand } from "./commands/screenshot.js";
import { textCommand } from "./commands/text.js";
import { consoleCommand } from "./commands/console.js";
import { networkCommand } from "./commands/network.js";

const program = new Command();

program
  .name("firecode")
  .description("Firefox browser automation for AI agents")
  .version("0.1.0");

program
  .command("start")
  .description("Launch Firefox and start the firecode server")
  .option("--headless", "Run Firefox in headless mode", false)
  .option("--headed", "Run Firefox in headed mode (default)")
  .option("-p, --port <port>", "HTTP API port (0 = auto)", parseInt)
  .action(async (options) => {
    await startCommand({
      headless: options.headless && !options.headed,
      port: options.port,
    });
  });

program
  .command("stop")
  .description("Stop the firecode server")
  .action(stopCommand);

program
  .command("status")
  .description("Show server status and open pages")
  .action(statusCommand);

program
  .command("browse")
  .description("Interact with a named page")
  .argument("<page>", "Page name")
  .argument(
    "<action>",
    "Action: navigate, click, fill, select, type, wait, hover, evaluate, scroll, wait-for, reload, back, forward",
  )
  .argument("[args...]", "Action arguments")
  .option("--force", "Force action past overlays")
  .action((page, action, args, options) => {
    browseCommand(page, action, args, options);
  });

program
  .command("snapshot")
  .description("Get AI-friendly ARIA snapshot of a page")
  .argument("<page>", "Page name")
  .action(snapshotCommand);

program
  .command("screenshot")
  .description("Capture a screenshot of a page")
  .argument("<page>", "Page name")
  .argument("[path]", "Output file path")
  .option("--diff <baseline>", "Compare against baseline screenshot")
  .action((page, path, options) => {
    screenshotCommand(page, path, options);
  });

program
  .command("text")
  .description("Get visible text content of a page")
  .argument("<page>", "Page name")
  .action(textCommand);

program
  .command("console")
  .description("Show browser console logs for a page")
  .argument("<page>", "Page name")
  .option("--clear", "Clear logs after displaying")
  .action((page, options) => {
    consoleCommand(page, options);
  });

program
  .command("network")
  .description("Show network requests for a page")
  .argument("<page>", "Page name")
  .option("--all", "Show all requests, not just failures")
  .option("--clear", "Clear logs after displaying")
  .action((page, options) => {
    networkCommand(page, options);
  });

program.parse();
```

- [ ] **Step 7: Build and verify**

Run: `pnpm build`
Expected: both packages build successfully.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/
git commit -m "add text, console, network commands and update browse with new actions"
```

---

### Task 4: End-to-End Test of New Features

**Files:** None (manual testing)

- [ ] **Step 1: Start server**

Run in background: `node packages/cli/dist/index.js start --headless &`
Wait 4 seconds for startup.

- [ ] **Step 2: Test navigate + snapshot (existing, sanity check)**

Run: `node packages/cli/dist/index.js browse main navigate "https://example.com"`
Expected: `Navigated to https://example.com`

Run: `node packages/cli/dist/index.js snapshot main`
Expected: ARIA tree with refs.

- [ ] **Step 3: Test evaluate**

Run: `node packages/cli/dist/index.js browse main evaluate "document.title"`
Expected: `"Example Domain"`

- [ ] **Step 4: Test scroll**

Run: `node packages/cli/dist/index.js browse main scroll down`
Expected: `Scrolled down`

Run: `node packages/cli/dist/index.js browse main scroll up`
Expected: `Scrolled up`

- [ ] **Step 5: Test reload**

Run: `node packages/cli/dist/index.js browse main reload`
Expected: `Reloaded, now at https://example.com/`

- [ ] **Step 6: Test back/forward**

Run: `node packages/cli/dist/index.js browse main click e2`
(Click the "More information..." link on example.com)

Run: `node packages/cli/dist/index.js browse main back`
Expected: `Went back, now at https://example.com/`

Run: `node packages/cli/dist/index.js browse main forward`
Expected: `Went forward, now at https://www.iana.org/...`

- [ ] **Step 7: Test text**

Run: `node packages/cli/dist/index.js browse main navigate "https://example.com"`
Run: `node packages/cli/dist/index.js text main`
Expected: visible text content including "Example Domain"

- [ ] **Step 8: Test console**

Run: `node packages/cli/dist/index.js browse main evaluate "console.log('test123')"`
Run: `node packages/cli/dist/index.js console main`
Expected: output includes `[LOG    ] test123`

- [ ] **Step 9: Test network**

Run: `node packages/cli/dist/index.js network main --all`
Expected: list of network requests with status codes.

Run: `node packages/cli/dist/index.js network main`
Expected: only failed requests (or "No failed requests.")

- [ ] **Step 10: Test screenshot diff**

Run: `node packages/cli/dist/index.js screenshot main /tmp/baseline.png`
Run: `node packages/cli/dist/index.js screenshot main /tmp/current.png --diff /tmp/baseline.png`
Expected: `No changes detected`

- [ ] **Step 11: Test --force flag**

Run: `node packages/cli/dist/index.js snapshot main`
(Get a ref)
Run: `node packages/cli/dist/index.js browse main click e1 --force`
Expected: `Clicked e1` (with force)

- [ ] **Step 12: Stop server and fix issues**

Run: `node packages/cli/dist/index.js stop`

If any step failed, debug and fix. Commit fixes.

- [ ] **Step 13: Commit fixes if needed**

```bash
git add -A
git commit -m "fix issues found during e2e testing of new features"
```

---

### Task 5: testgen Package Scaffold

**Files:**
- Create: `packages/testgen/package.json`
- Create: `packages/testgen/tsconfig.json`
- Create: `packages/testgen/tsup.config.ts`
- Create: `packages/testgen/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@firecode/testgen",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "simple-git": "^3",
    "playwright": "^1.52"
  },
  "devDependencies": {
    "tsup": "^8",
    "typescript": "^5.7",
    "@types/node": "^22"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 4: Create placeholder index.ts**

`packages/testgen/src/index.ts`:
```typescript
export { parseDiff } from "./diff.js";
export { analyzeChanges } from "./analyze.js";
export { generatePlan } from "./plan.js";
export { generateTests } from "./generate.js";
export { runTests } from "./run.js";
```

- [ ] **Step 5: Install deps**

Run: `pnpm install`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/testgen/
git commit -m "scaffold testgen package"
```

---

### Task 6: testgen — Diff + Analyze

**Files:**
- Create: `packages/testgen/src/diff.ts`
- Create: `packages/testgen/src/analyze.ts`

- [ ] **Step 1: Implement diff.ts**

```typescript
import simpleGit from "simple-git";

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  diff: string;
}

export interface DiffResult {
  files: DiffFile[];
  raw: string;
}

export async function parseDiff(
  target: "unstaged" | "branch" | "changes" = "changes",
  cwd?: string,
): Promise<DiffResult> {
  const git = simpleGit(cwd);

  let diffArgs: string[];
  switch (target) {
    case "unstaged":
      diffArgs = [];
      break;
    case "branch":
      diffArgs = ["main...HEAD"];
      break;
    case "changes":
      diffArgs = ["HEAD"];
      break;
  }

  const raw = await git.diff(diffArgs);
  const nameStatus = await git.diff([...diffArgs, "--name-status"]);

  const files: DiffFile[] = [];
  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [statusChar, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    if (!path) continue;

    let status: DiffFile["status"];
    switch (statusChar?.[0]) {
      case "A":
        status = "added";
        break;
      case "D":
        status = "deleted";
        break;
      case "R":
        status = "renamed";
        break;
      default:
        status = "modified";
        break;
    }

    // Extract the diff for this specific file
    const fileRegex = new RegExp(
      `diff --git a/.*${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*?(?=diff --git|$)`,
      "s",
    );
    const match = raw.match(fileRegex);

    files.push({ path, status, diff: match?.[0] ?? "" });
  }

  return { files, raw };
}
```

- [ ] **Step 2: Implement analyze.ts**

```typescript
import type { DiffFile } from "./diff.js";

export type FileCategory =
  | "component"
  | "page"
  | "api"
  | "style"
  | "config"
  | "other";

export interface AnalyzedFile {
  path: string;
  status: DiffFile["status"];
  category: FileCategory;
  diff: string;
}

export interface AnalysisResult {
  files: AnalyzedFile[];
  summary: string;
}

function categorizeFile(path: string): FileCategory {
  if (/\.(css|scss|sass|less|styl)$/.test(path)) return "style";
  if (/\.(tsx|jsx)$/.test(path)) return "component";
  if (
    /\/(routes|pages|views)\//i.test(path) ||
    /\.(page|route)\.(ts|js|tsx|jsx)$/.test(path)
  )
    return "page";
  if (
    /\/(api|server|handlers|controllers)\//i.test(path) ||
    /\.(api|handler|controller)\.(ts|js)$/.test(path)
  )
    return "api";
  if (
    /\.(json|yaml|yml|toml|env|config)\b/.test(path) ||
    /config/i.test(path)
  )
    return "config";
  return "other";
}

export function analyzeChanges(files: DiffFile[]): AnalysisResult {
  const analyzed: AnalyzedFile[] = files
    .filter((f) => f.status !== "deleted")
    .map((f) => ({
      path: f.path,
      status: f.status,
      category: categorizeFile(f.path),
      diff: f.diff,
    }));

  const counts = new Map<FileCategory, number>();
  for (const f of analyzed) {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [cat, count] of counts) {
    parts.push(`${count} ${cat} file${count > 1 ? "s" : ""}`);
  }
  const summary = `Changed: ${parts.join(", ")}`;

  return { files: analyzed, summary };
}
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build`
Expected: all packages build.

- [ ] **Step 4: Commit**

```bash
git add packages/testgen/src/diff.ts packages/testgen/src/analyze.ts
git commit -m "implement git diff parsing and file analysis"
```

---

### Task 7: testgen — Plan + Generate + Run

**Files:**
- Create: `packages/testgen/src/plan.ts`
- Create: `packages/testgen/src/generate.ts`
- Create: `packages/testgen/src/run.ts`

- [ ] **Step 1: Implement plan.ts**

```typescript
import type { AnalyzedFile, FileCategory } from "./analyze.js";

export interface TestPlanItem {
  description: string;
  file: string;
  category: FileCategory;
  checks: string[];
}

export interface TestPlan {
  items: TestPlanItem[];
  summary: string;
}

function planForCategory(
  file: AnalyzedFile,
): TestPlanItem {
  const checks: string[] = [];

  switch (file.category) {
    case "component":
      checks.push("Page loads without errors");
      checks.push("Component renders visible content");
      checks.push("Interactive elements are clickable");
      break;
    case "page":
      checks.push("Page loads and returns 200");
      checks.push("Page title is set");
      checks.push("Main content area is present");
      checks.push("Navigation works");
      break;
    case "api":
      checks.push("Page consuming this API loads");
      checks.push("Data is displayed after API responds");
      break;
    case "style":
      checks.push("Page loads without layout errors");
      checks.push("Take screenshot for visual verification");
      break;
    default:
      checks.push("Application still loads correctly");
      break;
  }

  return {
    description: `Test ${file.category}: ${file.path}`,
    file: file.path,
    category: file.category,
    checks,
  };
}

export function generatePlan(files: AnalyzedFile[]): TestPlan {
  const testableFiles = files.filter(
    (f) => f.category !== "config" && f.category !== "other",
  );

  const items = testableFiles.map(planForCategory);

  return {
    items,
    summary: `${items.length} test${items.length !== 1 ? "s" : ""} planned for ${testableFiles.length} file${testableFiles.length !== 1 ? "s" : ""}`,
  };
}
```

- [ ] **Step 2: Implement generate.ts**

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import type { TestPlanItem } from "./plan.js";

export interface GeneratedTest {
  path: string;
  content: string;
}

function generateTestContent(
  item: TestPlanItem,
  baseUrl: string,
): string {
  const checks = item.checks
    .map(
      (check, i) => `
  test('${check}', async ({ page }) => {
    await page.goto('${baseUrl}');
    // Verify: ${check}
    await expect(page.locator('body')).toBeVisible();
  });`,
    )
    .join("\n");

  return `import { test, expect } from '@playwright/test';

test.describe('${item.description}', () => {${checks}
});
`;
}

export async function generateTests(
  items: TestPlanItem[],
  baseUrl: string,
  outDir: string,
): Promise<GeneratedTest[]> {
  await mkdir(outDir, { recursive: true });

  const tests: GeneratedTest[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const safeName = basename(item.file)
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9]/g, "-");
    const testPath = join(outDir, `${i + 1}-${safeName}.spec.ts`);
    const content = generateTestContent(item, baseUrl);

    await writeFile(testPath, content);
    tests.push({ path: testPath, content });
  }

  return tests;
}
```

- [ ] **Step 3: Implement run.ts**

```typescript
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface TestResult {
  passed: boolean;
  output: string;
  exitCode: number;
}

export async function runTests(
  testDir: string,
  cleanup: boolean = true,
): Promise<TestResult> {
  try {
    const { stdout, stderr } = await exec(
      "npx",
      [
        "playwright",
        "test",
        "--project=firefox",
        "--reporter=line",
        testDir,
      ],
      {
        cwd: process.cwd(),
        timeout: 120000,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH:
            process.env.PLAYWRIGHT_BROWSERS_PATH ?? undefined,
        },
      },
    );

    if (cleanup) await rm(testDir, { recursive: true, force: true });

    return {
      passed: true,
      output: stdout + stderr,
      exitCode: 0,
    };
  } catch (err: any) {
    if (cleanup) await rm(testDir, { recursive: true, force: true });

    return {
      passed: false,
      output: err.stdout + err.stderr,
      exitCode: err.code ?? 1,
    };
  }
}
```

- [ ] **Step 4: Build and verify**

Run: `pnpm build`
Expected: all 3 packages build.

- [ ] **Step 5: Commit**

```bash
git add packages/testgen/src/plan.ts packages/testgen/src/generate.ts packages/testgen/src/run.ts
git commit -m "implement test plan generation, test file generation, and test runner"
```

---

### Task 8: CLI test Command

**Files:**
- Create: `packages/cli/src/commands/test.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Add testgen dependency to CLI**

Add to `packages/cli/package.json` dependencies:

```json
"@firecode/testgen": "workspace:*"
```

- [ ] **Step 2: Create test command**

`packages/cli/src/commands/test.ts`:

```typescript
import { parseDiff } from "@firecode/testgen";
import { analyzeChanges } from "@firecode/testgen";
import { generatePlan } from "@firecode/testgen";
import { generateTests } from "@firecode/testgen";
import { runTests } from "@firecode/testgen";
import { join } from "node:path";
import { createInterface } from "node:readline";

export interface TestOptions {
  target?: "unstaged" | "branch" | "changes";
  baseUrl?: string;
  message?: string;
  yes?: boolean;
}

export async function testCommand(options: TestOptions): Promise<void> {
  const target = options.target ?? "changes";
  const baseUrl = options.baseUrl ?? "http://localhost:3000";

  try {
    console.log(`Parsing git diff (${target})...`);
    const diff = await parseDiff(target);

    if (diff.files.length === 0) {
      console.log("No changes detected.");
      return;
    }

    console.log(`Found ${diff.files.length} changed file(s).`);

    const analysis = analyzeChanges(diff.files);
    console.log(analysis.summary);

    const plan = generatePlan(analysis.files);

    if (plan.items.length === 0) {
      console.log("No testable changes found.");
      return;
    }

    console.log(`\nTest plan (${plan.summary}):`);
    for (const item of plan.items) {
      console.log(`  - ${item.description}`);
      for (const check of item.checks) {
        console.log(`    - ${check}`);
      }
    }

    if (!options.yes) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await new Promise<string>((resolve) => {
        rl.question("\nRun these tests? (y/n) ", resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== "y") {
        console.log("Cancelled.");
        return;
      }
    }

    const testDir = join(process.cwd(), ".firecode", "tests");
    console.log("\nGenerating tests...");
    const tests = await generateTests(plan.items, baseUrl, testDir);
    console.log(`Generated ${tests.length} test file(s).`);

    console.log("Running tests...\n");
    const result = await runTests(testDir);

    console.log(result.output);
    if (result.passed) {
      console.log("All tests passed!");
    } else {
      console.log("Some tests failed.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Wire test command into CLI**

Add to `packages/cli/src/index.ts`, before `program.parse()`:

```typescript
import { testCommand } from "./commands/test.js";

program
  .command("test")
  .description("Generate and run tests from git changes")
  .option(
    "-t, --target <target>",
    "Diff scope: unstaged, branch, changes",
    "changes",
  )
  .option("--base-url <url>", "App URL to test against", "http://localhost:3000")
  .option("-m, --message <msg>", "Targeted test instruction")
  .option("-y, --yes", "Skip plan review")
  .action((options) => {
    testCommand(options);
  });
```

- [ ] **Step 4: Install deps and build**

Run: `pnpm install && pnpm build`
Expected: all 3 packages build.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/
git commit -m "add test command wiring diff, analysis, plan, generate, and run"
```

---

### Task 9: Update SKILL.md

**Files:**
- Modify: `skills/firecode/SKILL.md`

- [ ] **Step 1: Replace SKILL.md with updated docs**

Replace the full content of `skills/firecode/SKILL.md`:

````markdown
---
name: firecode
description: Browse websites with Firefox to verify your work, debug UI issues, and test web apps you're building. Use when working on web projects and you need to see what's on screen.
---

# Firecode — Browser Automation for Agents

You have access to a real Firefox browser. Use it to verify your work on web apps, debug UI issues, find bugs, and check that things look right, without asking the user to describe what they see.

## When to Use

- You just made changes to a web app and want to verify they work
- You need to debug a UI issue (layout broken, button not working, etc.)
- You want to check what a page looks like before and after your changes
- The user asks you to test or verify something in the browser
- You need to fill out a form, click through a flow, or interact with UI
- You want to catch JS errors or failed network requests

## Quick Start

```bash
# 1. Start the server (do this once per session)
firecode start

# 2. Navigate to the app
firecode browse main navigate "http://localhost:3000"

# 3. See what's on the page
firecode snapshot main

# 4. Interact with elements using ref IDs from the snapshot
firecode browse main click e4
firecode browse main fill e5 "hello@example.com"

# 5. Verify the result
firecode snapshot main

# 6. Check for errors
firecode console main
firecode network main
```

## Commands

### Server
- `firecode start` — launch Firefox (headed by default, `--headless` for headless)
- `firecode stop` — shut down Firefox and the server
- `firecode status` — check if server is running, list open pages

### Browsing
- `firecode browse <page> navigate <url>` — go to a URL (creates page if needed)
- `firecode browse <page> click <ref> [--force]` — click an element
- `firecode browse <page> fill <ref> <value> [--force]` — clear and fill a text input
- `firecode browse <page> type <ref> <text>` — type text character by character
- `firecode browse <page> select <ref> <value> [--force]` — select a dropdown option
- `firecode browse <page> hover <ref> [--force]` — hover over an element
- `firecode browse <page> wait <ms>` — wait for a duration
- `firecode browse <page> evaluate "<js>"` — run JavaScript and get result
- `firecode browse <page> scroll down|up|<ref>` — scroll page or to an element
- `firecode browse <page> wait-for "<text>"` — wait for text to appear
- `firecode browse <page> wait-for --selector "<css>" [--timeout ms]` — wait for selector
- `firecode browse <page> reload` — refresh the page
- `firecode browse <page> back` — go back in history
- `firecode browse <page> forward` — go forward in history

### Observing
- `firecode snapshot <page>` — get ARIA accessibility tree with ref IDs
- `firecode screenshot <page> [path]` — capture PNG screenshot
- `firecode screenshot <page> [path] --diff <baseline>` — compare against baseline
- `firecode text <page>` — get visible text content (lighter than snapshot)
- `firecode console <page> [--clear]` — show browser console logs
- `firecode network <page> [--all] [--clear]` — show failed network requests

### Testing
- `firecode test` — generate and run tests from git changes
- `firecode test --target unstaged|branch|changes` — choose diff scope
- `firecode test --base-url http://localhost:3000` — set app URL
- `firecode test -y` — skip plan review

## How Snapshots Work

`firecode snapshot` returns a YAML-like accessibility tree. Each interactive element has a `[ref=eN]` tag:

```yaml
- navigation:
  - link "Dashboard" [ref=e1]
  - link "Settings" [ref=e2]
- main:
  - heading "Profile" [ref=e3]
  - textbox "Name" [ref=e4]
  - textbox "Email" [ref=e5]
  - button "Save" [ref=e6]
```

To fill the name field: `firecode browse main fill e4 "John Doe"`
To click save: `firecode browse main click e6`

**Important:** Refs are tied to the last snapshot. If the page changes, take a new snapshot.

## Debugging Workflow

When verifying your changes:

```bash
# 1. Navigate and check the page
firecode browse app navigate "http://localhost:3000"
firecode snapshot app

# 2. Check for JS errors
firecode console app

# 3. Check for failed API calls
firecode network app

# 4. If something looks wrong, get a screenshot
firecode screenshot app /tmp/debug.png

# 5. After making a fix, reload and check again
firecode browse app reload
firecode console app --clear
firecode snapshot app
```

## Tips

- **One action at a time.** Do one thing, check the result.
- **Snapshot before interacting.** Know what's on the page before clicking.
- **Snapshot after interacting.** Verify your action worked.
- **Check console after page loads.** Catch React errors, unhandled promises early.
- **Check network after page loads.** Catch 404s and failed API calls.
- **Use --force for stubborn elements.** Sticky navs and overlays can block clicks.
- **Screenshot for visual issues.** Snapshots show structure, screenshots show appearance.
- **Use evaluate for quick checks.** `firecode browse main evaluate "document.title"` is faster than a full snapshot.
- **If a ref fails,** the page probably changed. Take a fresh snapshot.
````

- [ ] **Step 2: Commit**

```bash
git add skills/firecode/SKILL.md
git commit -m "update SKILL.md with all new commands and debugging workflow"
```

---

### Task 10: Final Build + Verification

- [ ] **Step 1: Full clean build**

Run: `pnpm clean && pnpm build`
Expected: all 3 packages build with no errors.

- [ ] **Step 2: Verify CLI help**

Run: `node packages/cli/dist/index.js --help`
Expected: shows all commands including text, console, network, test.

Run: `node packages/cli/dist/index.js browse --help`
Expected: shows --force option and updated action list.

- [ ] **Step 3: Quick smoke test**

```bash
node packages/cli/dist/index.js start --headless &
sleep 4
node packages/cli/dist/index.js browse main navigate "https://example.com"
node packages/cli/dist/index.js text main
node packages/cli/dist/index.js console main
node packages/cli/dist/index.js network main
node packages/cli/dist/index.js browse main evaluate "1+1"
node packages/cli/dist/index.js browse main scroll down
node packages/cli/dist/index.js browse main reload
node packages/cli/dist/index.js stop
```

All commands should succeed without errors.

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix issues found during final verification"
```
