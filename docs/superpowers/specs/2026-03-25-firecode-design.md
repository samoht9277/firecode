# Firecode Design Spec

Firefox browser automation skill that gives Claude Code / Cowork agents autonomous access to a real browser. The core use case: when an agent is building or modifying a web app, it can launch a browser, navigate to the app, see the page via ARIA snapshots, interact with elements, and verify its own work — without the user acting as a proxy to describe what's on screen.

Two modes sharing a single Firefox instance via Playwright:
- **Browse mode (primary)**: the agent's eyes and hands in the browser
- **Test mode (secondary, later)**: automated test generation from git diffs

## Architecture

### Server Process

- `firefox.launchServer({ headless })` launches a persistent Firefox instance
- WS endpoint + PID stored in `~/.firecode/server.json`
- A Fastify HTTP server runs alongside for CLI-to-server communication
- Server runs in foreground (user ctrl+C or `firecode stop` to kill)
- CLI commands hit the HTTP API, server executes Playwright operations, returns results

### HTTP API Endpoints

```
POST /pages              { name }                → create named page
GET  /pages                                      → list all pages
GET  /pages/:name/snapshot                       → AI-friendly ARIA snapshot with refs
POST /pages/:name/screenshot  { path? }          → capture PNG
POST /pages/:name/action      { action, args }   → execute action (navigate, click, fill, etc.)
DELETE /pages/:name                               → close page
POST /shutdown                                    → graceful shutdown
GET  /status                                      → server health + page count
```

### Page Management

- `Map<string, Page>` in server memory, keyed by user-chosen name
- Pages persist across CLI invocations (that's the whole point)
- Creating a page with an existing name returns the existing one
- Each page gets its own `BrowserContext` for isolation

### AI-Friendly DOM Snapshots

Uses Playwright's built-in `locator.ariaSnapshot()` API (available since 1.50), post-processed to:

1. Add `[ref=eN]` tags to interactive and named content elements
2. Maintain a `Map<string, Locator>` per page mapping ref IDs to Playwright Locators
3. Output YAML-like format:

```yaml
- banner:
  - link "Home" [ref=e1]
  - link "About" [ref=e2]
- main:
  - heading "Welcome" [ref=e3]
  - form:
    - textbox "Email" [ref=e4]
    - textbox "Password" [ref=e5]
    - button "Sign in" [ref=e6]
- contentinfo:
  - text "© 2026 Acme Corp"
```

Ref map is rebuilt on each snapshot call (page state changes between calls).

### Ref Resolution

When the agent says "click e4", the server:
1. Looks up `e4` in the page's ref map
2. Gets the corresponding Playwright `Locator`
3. Calls `.click()` on it

If the ref is stale (page changed since last snapshot), the action fails with a clear error telling the agent to re-snapshot.

## CLI Interface

Commander.js CLI with the following commands:

### Server Lifecycle

```bash
firecode start [--headless]     # launch Firefox + HTTP server, block in foreground
firecode start --headed          # explicitly headed (default)
firecode stop                    # send shutdown to HTTP API, fallback to kill PID
firecode status                  # ping server, show state + open pages
```

### Browse Mode (Action Subcommands)

```bash
firecode browse <page> navigate <url>
firecode browse <page> click <ref>
firecode browse <page> fill <ref> <value>
firecode browse <page> select <ref> <value>
firecode browse <page> type <ref> <text>
firecode browse <page> wait <ms>
firecode browse <page> hover <ref>
```

Each action maps 1:1 to a Playwright call on the server side. One action per invocation, keeping the "small scripts that do ONE thing" philosophy.

### Snapshot & Screenshot

```bash
firecode snapshot <page>           # print AI-friendly ARIA snapshot to stdout
firecode screenshot <page> [path]  # capture PNG, save to path or print default path
```

### Test Mode

```bash
firecode test [--target unstaged|branch|changes] [--base-url URL] [-m "instruction"] [-y]
```

- `--target`: which git diff scope to use (default: `changes`)
- `--base-url`: app URL to test against (default: `http://localhost:3000`)
- `-m`: targeted test instruction (e.g., "test the login flow")
- `-y`: skip plan review, run immediately

## Test Mode Flow

1. **Diff** — parse git diff using `simple-git` based on `--target`:
   - `unstaged`: `git diff` (working tree vs index)
   - `branch`: `git diff main...HEAD` (all branch changes)
   - `changes` (default): `git diff HEAD` (everything uncommitted)

2. **Analyze** — categorize changed files by type (component, route, API, style, config) and extract what specifically changed (function names, component names, endpoints)

3. **Plan** — generate a test plan: list of things to verify in the browser. Template-based for v1:
   - Form component changed → test submission, validation
   - Route/controller changed → test page loads, data displays
   - CSS changed → screenshot comparison
   - API endpoint changed → test consuming UI

4. **Review** — show plan to user, wait for approval (skip with `-y`)

5. **Generate** — produce Playwright `.spec.ts` files in `.firecode/tests/` from templates

6. **Run** — execute via Playwright's programmatic API with Firefox config

7. **Report** — print pass/fail results with details, clean up temp files

## Monorepo Structure

```
firecode/
  packages/
    server/
      src/
        index.ts          # main: launch Firefox, start Fastify, write server.json
        pages.ts          # Map<string, Page>, create/get/list/close
        snapshot.ts       # ariaSnapshot() + ref tagging + ref map
        api.ts            # Fastify route handlers
    cli/
      src/
        index.ts          # Commander.js setup, command registration
        commands/
          start.ts        # launch server (imports from server package)
          stop.ts         # send shutdown / kill PID
          browse.ts       # action subcommands → POST /pages/:name/action
          snapshot.ts     # GET /pages/:name/snapshot
          screenshot.ts   # POST /pages/:name/screenshot
          test.ts         # full test mode flow
          status.ts       # GET /status
    testgen/
      src/
        diff.ts           # git diff parsing via simple-git
        analyze.ts        # categorize changes, extract details
        plan.ts           # generate test plan from analysis
        generate.ts       # produce .spec.ts files from templates
        run.ts            # execute tests, collect results
  skills/
    firecode/
      SKILL.md            # agent instructions for Claude Code / Cowork
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.json
```

## Dependencies

### Runtime
- `playwright` — Firefox automation
- `commander` — CLI framework
- `simple-git` — git diff parsing (testgen only)
- `fastify` — HTTP server for internal API

### Dev
- `typescript`
- `tsup` — bundling
- `turbo` — monorepo task runner
- `tsx` — running TypeScript directly during dev

## Build

- Each package compiles with `tsup` to ESM
- CLI package has `bin` entry in package.json
- `pnpm link` for local dev, eventually publishable

## Implementation Order

Phase 1 — Browse mode (the core value):
1. Monorepo scaffold (package.json, pnpm-workspace, turbo, tsconfig)
2. `packages/server` — Firefox lifecycle, WS endpoint, page registry, Fastify API
3. `packages/cli` — start/stop/status commands
4. `packages/server/snapshot.ts` — AI-friendly DOM snapshots with refs
5. `packages/cli` browse/snapshot/screenshot commands
6. `skills/firecode/SKILL.md` — agent instructions (critical, this is how the agent knows when/how to use firecode)
7. End-to-end test: start firecode, browse a page, take a snapshot, interact

Phase 2 — Test mode (later):
8. `packages/testgen` — diff, analyze, plan, generate, run
9. `packages/cli` test command

## Constraints

- Firefox only. No Chromium, no browser selection.
- Clean isolated Firefox instance every time. No user profile sharing.
- Default is headed (see what the agent is doing). `--headless` to toggle.
- Minimal dependencies. Playwright is the heavy one, everything else lightweight.
- Server handles unexpected disconnects gracefully (browser crash, etc).
