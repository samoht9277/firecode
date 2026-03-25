# Firecode Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browse mode of firecode — a CLI tool that launches Firefox via Playwright, manages named pages, provides AI-friendly ARIA snapshots, and lets agents interact with elements via ref IDs.

**Architecture:** A persistent server process launches Firefox via `firefox.launchServer()`, exposes an HTTP API via Fastify for page management/actions/snapshots. A separate CLI binary (Commander.js) sends HTTP requests to the server. State file at `~/.firecode/server.json` bridges the two.

**Tech Stack:** TypeScript (strict, ESM), Playwright (Firefox), Fastify, Commander.js, pnpm monorepo with turbo, tsup for bundling.

---

## File Structure

```
firecode/
  package.json                    # root workspace config
  pnpm-workspace.yaml             # workspace definition
  turbo.json                      # turbo pipeline
  tsconfig.json                   # base tsconfig
  packages/
    server/
      package.json
      tsconfig.json
      tsup.config.ts
      src/
        index.ts                  # startServer(): launch Firefox, Fastify, write state
        pages.ts                  # PageManager class: create, get, list, close pages
        snapshot.ts               # getSnapshot(): ARIA snapshot with refs, ref resolution
        api.ts                    # Fastify routes wiring PageManager + snapshot
        types.ts                  # shared types (ServerState, Action, SnapshotResult, etc.)
    cli/
      package.json
      tsconfig.json
      tsup.config.ts
      src/
        index.ts                  # Commander.js program, registers all commands
        client.ts                 # HTTP client helper (reads server.json, calls API)
        commands/
          start.ts                # firecode start [--headless]
          stop.ts                 # firecode stop
          status.ts               # firecode status
          browse.ts               # firecode browse <page> <action> [args...]
          snapshot.ts             # firecode snapshot <page>
          screenshot.ts           # firecode screenshot <page> [path]
  skills/
    firecode/
      SKILL.md                    # agent instructions for Claude Code / Cowork
```

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.json`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/tsup.config.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "firecode",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.7"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 4: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.turbo/
*.tsbuildinfo
```

- [ ] **Step 6: Create packages/server/package.json**

```json
{
  "name": "@firecode/server",
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
    "playwright": "^1.52",
    "fastify": "^5"
  },
  "devDependencies": {
    "tsup": "^8",
    "typescript": "^5.7"
  }
}
```

- [ ] **Step 7: Create packages/server/tsconfig.json**

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

- [ ] **Step 8: Create packages/server/tsup.config.ts**

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

- [ ] **Step 9: Create packages/cli/package.json**

```json
{
  "name": "@firecode/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "firecode": "dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@firecode/server": "workspace:*",
    "commander": "^13"
  },
  "devDependencies": {
    "tsup": "^8",
    "typescript": "^5.7"
  }
}
```

- [ ] **Step 10: Create packages/cli/tsconfig.json**

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

- [ ] **Step 11: Create packages/cli/tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 12: Install dependencies**

Run: `pnpm install`
Expected: lockfile created, node_modules populated, no errors.

- [ ] **Step 13: Verify build works**

Create minimal placeholder files:

`packages/server/src/index.ts`:
```typescript
export { startServer } from "./api.js";
export { PageManager } from "./pages.js";
```

`packages/server/src/types.ts`:
```typescript
export interface ServerState {
  wsEndpoint: string;
  httpPort: number;
  pid: number;
}
```

`packages/server/src/pages.ts`:
```typescript
export class PageManager {}
```

`packages/server/src/snapshot.ts`:
```typescript
export function getSnapshot() {}
```

`packages/server/src/api.ts`:
```typescript
export function startServer() {}
```

`packages/cli/src/index.ts`:
```typescript
console.log("firecode cli");
```

`packages/cli/src/client.ts`:
```typescript
export class FirecodeClient {}
```

Run: `pnpm build`
Expected: both packages build successfully, dist/ directories created.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "scaffold monorepo with server and cli packages"
```

---

### Task 2: Server Types

**Files:**
- Modify: `packages/server/src/types.ts`

- [ ] **Step 1: Define all shared types**

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
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/types.ts
git commit -m "add shared server types"
```

---

### Task 3: Page Manager

**Files:**
- Modify: `packages/server/src/pages.ts`

- [ ] **Step 1: Implement PageManager class**

```typescript
import type { Browser, BrowserContext, Page } from "playwright";
import type { PageInfo, RefMap } from "./types.js";

interface PageEntry {
  page: Page;
  context: BrowserContext;
  refMap: RefMap;
}

export class PageManager {
  private pages = new Map<string, PageEntry>();
  private browser: Browser | null = null;

  setBrowser(browser: Browser): void {
    this.browser = browser;
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

    if (!this.browser) {
      throw new Error("Browser not connected");
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();
    this.pages.set(name, {
      page,
      context,
      refMap: { refs: new Map(), timestamp: 0 },
    });

    return { name, url: page.url(), title: await page.title() };
  }

  getPage(name: string): Page {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found. Use "firecode browse ${name} navigate <url>" to create it.`);
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
    await entry.context.close();
    this.pages.delete(name);
  }

  async closeAll(): Promise<void> {
    for (const name of this.pages.keys()) {
      await this.closePage(name);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/pages.ts
git commit -m "implement PageManager with named page lifecycle"
```

---

### Task 4: ARIA Snapshot with Refs

**Files:**
- Modify: `packages/server/src/snapshot.ts`

- [ ] **Step 1: Implement snapshot generation with ref tagging**

```typescript
import type { Page, Locator } from "playwright";
import type { RefMap, SnapshotResult } from "./types.js";

export async function getSnapshot(page: Page): Promise<{ snapshot: string; refMap: RefMap }> {
  const raw = await page.locator("body").ariaSnapshot({ timeout: 10000 });

  let refCounter = 0;
  const refs = new Map<string, { role: string; name: string }>();

  // Parse the ARIA snapshot YAML and add ref tags to interactive/named elements
  // Format: "- role \"name\"" or "- role:" (container)
  const lines = raw.split("\n");
  const tagged = lines.map((line) => {
    // Match lines like: "  - button \"Submit\"" or "  - textbox \"Email\""
    const match = line.match(/^(\s*- )(\w+)\s+"([^"]*)"(.*)$/);
    if (!match) return line;

    const [, indent, role, name, rest] = match;
    const interactiveRoles = [
      "link", "button", "textbox", "checkbox", "radio",
      "combobox", "slider", "switch", "tab", "menuitem",
      "option", "searchbox", "spinbutton", "heading",
    ];

    if (interactiveRoles.includes(role) || name) {
      refCounter++;
      const refId = `e${refCounter}`;
      refs.set(refId, { role, name });
      return `${indent}${role} "${name}" [ref=${refId}]${rest}`;
    }

    return line;
  });

  return {
    snapshot: tagged.join("\n"),
    refMap: { refs, timestamp: Date.now() },
  };
}

export function resolveRef(
  page: Page,
  refMap: RefMap,
  refId: string
): Locator {
  const entry = refMap.refs.get(refId);
  if (!entry) {
    throw new Error(
      `Ref "${refId}" not found. Available refs: ${[...refMap.refs.keys()].join(", ")}. Re-run "firecode snapshot" to refresh.`
    );
  }

  return page.getByRole(entry.role as any, { name: entry.name });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/snapshot.ts
git commit -m "implement ARIA snapshot with ref tagging and resolution"
```

---

### Task 5: Fastify API Routes

**Files:**
- Modify: `packages/server/src/api.ts`

- [ ] **Step 1: Implement all HTTP API routes**

```typescript
import Fastify from "fastify";
import { PageManager } from "./pages.js";
import { getSnapshot, resolveRef } from "./snapshot.js";
import type { ActionRequest } from "./types.js";

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
  app.get<{ Params: { name: string } }>("/pages/:name/snapshot", async (req) => {
    const page = pageManager.getPage(req.params.name);
    const result = await getSnapshot(page);
    pageManager.setRefMap(req.params.name, result.refMap);
    return { snapshot: result.snapshot, refCount: result.refMap.refs.size };
  });

  // Screenshot
  app.post<{ Params: { name: string }; Body: { path?: string } }>(
    "/pages/:name/screenshot",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const screenshotPath =
        req.body?.path ?? `/tmp/firecode-screenshot-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return { ok: true, path: screenshotPath };
    }
  );

  // Execute action
  app.post<{ Params: { name: string }; Body: ActionRequest }>(
    "/pages/:name/action",
    async (req) => {
      const { action, args } = req.body;
      const page = pageManager.getPage(req.params.name);
      const refMap = pageManager.getRefMap(req.params.name);

      switch (action) {
        case "navigate": {
          const url = args[0];
          if (!url) throw new Error("navigate requires a URL");
          await page.goto(url, { waitUntil: "domcontentloaded" });
          return { ok: true, message: `Navigated to ${url}` };
        }
        case "click": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.click();
          return { ok: true, message: `Clicked ${args[0]}` };
        }
        case "fill": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.fill(args[1] ?? "");
          return { ok: true, message: `Filled ${args[0]} with "${args[1]}"` };
        }
        case "select": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.selectOption(args[1] ?? "");
          return { ok: true, message: `Selected "${args[1]}" on ${args[0]}` };
        }
        case "type": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.pressSequentially(args[1] ?? "", { delay: 50 });
          return { ok: true, message: `Typed "${args[1]}" into ${args[0]}` };
        }
        case "hover": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.hover();
          return { ok: true, message: `Hovered ${args[0]}` };
        }
        case "wait": {
          const ms = parseInt(args[0] ?? "1000", 10);
          await page.waitForTimeout(ms);
          return { ok: true, message: `Waited ${ms}ms` };
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }
  );

  // Close page
  app.delete<{ Params: { name: string } }>("/pages/:name", async (req) => {
    await pageManager.closePage(req.params.name);
    return { ok: true, message: `Closed page "${req.params.name}"` };
  });

  // Shutdown
  app.post("/shutdown", async () => {
    // Respond first, then shutdown
    setTimeout(async () => {
      await pageManager.closeAll();
      process.exit(0);
    }, 100);
    return { ok: true, message: "Shutting down" };
  });

  return app;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/api.ts
git commit -m "implement Fastify API routes for page management and actions"
```

---

### Task 6: Server Entry Point

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Implement startServer function**

```typescript
import { firefox } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createApp } from "./api.js";
import { PageManager } from "./pages.js";
import { SERVER_STATE_PATH, FIRECODE_DIR } from "./types.js";
import type { ServerState } from "./types.js";

export { PageManager } from "./pages.js";
export { getSnapshot, resolveRef } from "./snapshot.js";
export type { ServerState, PageInfo, SnapshotResult, ActionType } from "./types.js";

export interface StartServerOptions {
  headless?: boolean;
  port?: number;
}

export async function startServer(options: StartServerOptions = {}): Promise<void> {
  const headless = options.headless ?? false;
  const port = options.port ?? 0; // 0 = auto-assign

  console.log(`Launching Firefox (${headless ? "headless" : "headed"})...`);

  const browserServer = await firefox.launchServer({
    headless,
  });
  const wsEndpoint = browserServer.wsEndpoint();
  console.log(`Firefox WS endpoint: ${wsEndpoint}`);

  // Connect to the browser for page management
  const browser = await firefox.connect(wsEndpoint);
  const pageManager = new PageManager();
  pageManager.setBrowser(browser);

  // Start HTTP API
  const app = createApp(pageManager);
  const address = await app.listen({ port, host: "127.0.0.1" });
  const httpPort = parseInt(new URL(address).port, 10);
  console.log(`HTTP API listening on ${address}`);

  // Write state file
  await mkdir(FIRECODE_DIR, { recursive: true });
  const state: ServerState = {
    wsEndpoint,
    httpPort,
    pid: process.pid,
  };
  await writeFile(SERVER_STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`State written to ${SERVER_STATE_PATH}`);
  console.log("Firecode server running. Press Ctrl+C to stop.");

  // Graceful shutdown
  const cleanup = async () => {
    console.log("\nShutting down...");
    await pageManager.closeAll();
    await app.close();
    browserServer.close();
    try {
      await rm(SERVER_STATE_PATH);
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Handle browser crash
  browser.on("disconnected", () => {
    console.error("Browser disconnected unexpectedly");
    cleanup();
  });
}
```

- [ ] **Step 2: Update server package exports in tsup config**

`packages/server/tsup.config.ts`:
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

(No change needed, already correct.)

- [ ] **Step 3: Build and verify**

Run: `cd /Users/tomi/Personal/firecode && pnpm build`
Expected: both packages build with no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "implement server entry point with Firefox lifecycle and graceful shutdown"
```

---

### Task 7: CLI HTTP Client

**Files:**
- Modify: `packages/cli/src/client.ts`

- [ ] **Step 1: Implement FirecodeClient**

```typescript
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

    // Verify the server is actually alive
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/client.ts
git commit -m "implement FirecodeClient HTTP helper"
```

---

### Task 8: CLI Commands — start, stop, status

**Files:**
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/commands/stop.ts`
- Create: `packages/cli/src/commands/status.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Implement start command**

`packages/cli/src/commands/start.ts`:
```typescript
import { startServer } from "@firecode/server";

export interface StartOptions {
  headless?: boolean;
  port?: number;
}

export async function startCommand(options: StartOptions): Promise<void> {
  await startServer({
    headless: options.headless ?? false,
    port: options.port,
  });
}
```

- [ ] **Step 2: Implement stop command**

`packages/cli/src/commands/stop.ts`:
```typescript
import { FirecodeClient } from "../client.js";

export async function stopCommand(): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    await client.post("/shutdown");
    console.log("Firecode server stopped.");
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Implement status command**

`packages/cli/src/commands/status.ts`:
```typescript
import { FirecodeClient } from "../client.js";

export async function statusCommand(): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const status = await client.get("/status");
    console.log(`Server: running`);
    console.log(`Pages: ${status.pages}`);
    if (status.pageList?.length > 0) {
      for (const page of status.pageList) {
        console.log(`  ${page.name}: ${page.url} — "${page.title}"`);
      }
    }
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Wire up CLI entry point**

`packages/cli/src/index.ts`:
```typescript
import { Command } from "commander";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";

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

program.parse();
```

- [ ] **Step 5: Create commands directory**

Run: `mkdir -p packages/cli/src/commands`

- [ ] **Step 6: Build and verify**

Run: `pnpm build`
Expected: both packages build successfully.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/
git commit -m "add start, stop, and status CLI commands"
```

---

### Task 9: CLI Commands — browse, snapshot, screenshot

**Files:**
- Create: `packages/cli/src/commands/browse.ts`
- Create: `packages/cli/src/commands/snapshot.ts`
- Create: `packages/cli/src/commands/screenshot.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Implement browse command**

`packages/cli/src/commands/browse.ts`:
```typescript
import { FirecodeClient } from "../client.js";

const VALID_ACTIONS = [
  "navigate",
  "click",
  "fill",
  "select",
  "type",
  "wait",
  "hover",
] as const;

export async function browseCommand(
  pageName: string,
  action: string,
  args: string[]
): Promise<void> {
  if (!VALID_ACTIONS.includes(action as any)) {
    console.error(
      `Unknown action "${action}". Valid actions: ${VALID_ACTIONS.join(", ")}`
    );
    process.exit(1);
  }

  try {
    const client = await FirecodeClient.connect();

    // Ensure page exists (navigate creates it implicitly)
    if (action === "navigate") {
      await client.post("/pages", { name: pageName });
    }

    const result = await client.post(`/pages/${pageName}/action`, {
      action,
      args,
    });

    console.log(result.message);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Implement snapshot command**

`packages/cli/src/commands/snapshot.ts`:
```typescript
import { FirecodeClient } from "../client.js";

export async function snapshotCommand(pageName: string): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.get(`/pages/${pageName}/snapshot`);
    console.log(result.snapshot);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Implement screenshot command**

`packages/cli/src/commands/screenshot.ts`:
```typescript
import { FirecodeClient } from "../client.js";

export async function screenshotCommand(
  pageName: string,
  path?: string
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.post(`/pages/${pageName}/screenshot`, {
      path,
    });
    console.log(result.path);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Wire browse, snapshot, screenshot into CLI**

Add to `packages/cli/src/index.ts`, before `program.parse()`:

```typescript
import { browseCommand } from "./commands/browse.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { screenshotCommand } from "./commands/screenshot.js";

program
  .command("browse")
  .description("Interact with a named page")
  .argument("<page>", "Page name")
  .argument("<action>", "Action: navigate, click, fill, select, type, wait, hover")
  .argument("[args...]", "Action arguments")
  .action(browseCommand);

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
  .action(screenshotCommand);
```

- [ ] **Step 5: Build and verify**

Run: `pnpm build`
Expected: builds successfully.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/
git commit -m "add browse, snapshot, and screenshot CLI commands"
```

---

### Task 10: SKILL.md — Agent Instructions

**Files:**
- Create: `skills/firecode/SKILL.md`

- [ ] **Step 1: Write the skill file**

```markdown
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
```

## Commands

### Server
- `firecode start` — launch Firefox (headed by default, use `--headless` for headless)
- `firecode stop` — shut down Firefox and the server
- `firecode status` — check if server is running, list open pages

### Browsing
- `firecode browse <page> navigate <url>` — go to a URL (creates the page if it doesn't exist)
- `firecode browse <page> click <ref>` — click an element by ref ID
- `firecode browse <page> fill <ref> <value>` — clear and fill a text input
- `firecode browse <page> type <ref> <text>` — type text character by character
- `firecode browse <page> select <ref> <value>` — select a dropdown option
- `firecode browse <page> hover <ref>` — hover over an element
- `firecode browse <page> wait <ms>` — wait for a duration

### Observing
- `firecode snapshot <page>` — get the ARIA accessibility tree with ref IDs
- `firecode screenshot <page> [path]` — capture a PNG screenshot

## How Snapshots Work

`firecode snapshot` returns a YAML-like accessibility tree. Each interactive element has a `[ref=eN]` tag you can use in browse commands:

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

**Important:** Refs are tied to the last snapshot. If the page changes (navigation, dynamic content), take a new snapshot before interacting.

## Tips

- **One action at a time.** Don't try to batch multiple actions. Do one thing, check the result.
- **Snapshot before interacting.** Always know what's on the page before clicking/filling.
- **Snapshot after interacting.** Verify your action had the expected effect.
- **Use named pages.** `main` for the primary page, `debug` for a second tab, etc. Pages persist between commands.
- **Screenshot for visual issues.** Snapshots show structure, screenshots show appearance. Use screenshots when layout/styling matters.
- **Navigate creates the page.** You don't need to explicitly create a page, just navigate to a URL.
- **If a ref fails,** the page probably changed. Take a fresh snapshot.

## Example Workflow: Verify a Form Submission

```bash
firecode start
firecode browse app navigate "http://localhost:3000/signup"
firecode snapshot app
# Output shows: textbox "Email" [ref=e3], textbox "Password" [ref=e4], button "Sign Up" [ref=e5]
firecode browse app fill e3 "test@example.com"
firecode browse app fill e4 "password123"
firecode browse app click e5
firecode snapshot app
# Check if we're on a success page or if there's an error message
```

## Example Workflow: Debug a Broken Page

```bash
firecode browse debug navigate "http://localhost:3000/broken-page"
firecode snapshot debug
# Read the snapshot to understand the page structure
firecode screenshot debug /tmp/broken-page.png
# Look at the screenshot for visual issues
```
```

- [ ] **Step 2: Commit**

```bash
git add skills/firecode/SKILL.md
git commit -m "add firecode skill instructions for AI agents"
```

---

### Task 11: End-to-End Verification

**Files:** None (manual testing)

- [ ] **Step 1: Install Playwright Firefox**

Run: `cd /Users/tomi/Personal/firecode && npx playwright install firefox`
Expected: Firefox browser downloaded successfully.

- [ ] **Step 2: Build the project**

Run: `pnpm build`
Expected: all packages build cleanly.

- [ ] **Step 3: Start the server**

Run in a background shell: `node packages/cli/dist/index.js start`
Expected: Output shows Firefox launched, HTTP API listening, state file written.

- [ ] **Step 4: Check status**

Run: `node packages/cli/dist/index.js status`
Expected: `Server: running`, `Pages: 0`.

- [ ] **Step 5: Navigate to a page**

Run: `node packages/cli/dist/index.js browse main navigate "https://example.com"`
Expected: `Navigated to https://example.com`

- [ ] **Step 6: Take a snapshot**

Run: `node packages/cli/dist/index.js snapshot main`
Expected: YAML accessibility tree output with `[ref=eN]` tags on links and headings.

- [ ] **Step 7: Take a screenshot**

Run: `node packages/cli/dist/index.js screenshot main /tmp/firecode-test.png`
Expected: `/tmp/firecode-test.png` printed, file exists and shows example.com.

- [ ] **Step 8: Check status with page**

Run: `node packages/cli/dist/index.js status`
Expected: Shows `main: https://example.com/ — "Example Domain"`.

- [ ] **Step 9: Stop the server**

Run: `node packages/cli/dist/index.js stop`
Expected: `Firecode server stopped.`

- [ ] **Step 10: Fix any issues found during testing**

If any step above fails, debug and fix. Commit fixes individually with descriptive messages.

- [ ] **Step 11: Final commit if needed**

```bash
git add -A
git commit -m "fix issues found during end-to-end testing"
```
