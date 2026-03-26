# Firecode Features Design Spec

New browse actions and Phase 2 test mode for firecode.

## New Browse Actions

### 1. `evaluate` — Run JS on a page

```bash
firecode browse <page> evaluate "<js expression>"
```

- Runs `page.evaluate()` with the given JS string
- Returns the result as JSON to stdout
- API: `POST /pages/:name/action` with `{ action: "evaluate", args: ["<js>"] }`

### 2. `--force` flag — Force interactions past overlays

```bash
firecode browse <page> click <ref> --force
```

- Remove hardcoded `force: true` from click action
- Add `--force` flag to the `browse` command that gets passed through as an extra arg
- Server checks for `"--force"` in args array and passes `{ force: true }` to click/fill/select/type/hover
- Default behavior: no force (standard Playwright actionability checks)

### 3. `scroll` — Scroll the page or to an element

```bash
firecode browse <page> scroll down
firecode browse <page> scroll up
firecode browse <page> scroll <ref>
```

- `down`/`up`: scroll by one viewport height via `page.evaluate`
- `<ref>`: resolve ref and call `locator.scrollIntoViewIfNeeded()`
- API: `POST /pages/:name/action` with `{ action: "scroll", args: ["down"|"up"|refId] }`

### 4. `wait-for` — Wait for text or selector to appear

```bash
firecode browse <page> wait-for "Some text"
firecode browse <page> wait-for --selector ".my-class"
firecode browse <page> wait-for --selector ".my-class" --timeout 5000
```

- Default: waits for text to be visible on the page via `page.getByText(text).waitFor()`
- `--selector`: waits for CSS selector via `page.waitForSelector(selector)`
- Default timeout: 10000ms, override with `--timeout`
- API: `POST /pages/:name/action` with `{ action: "wait-for", args: ["text or selector", "--selector"?, "--timeout"?, "ms"?] }`

### 5. `reload` action — Refresh the page

```bash
firecode browse <page> reload
```

- Calls `page.reload({ waitUntil: "domcontentloaded" })`
- API: `POST /pages/:name/action` with `{ action: "reload", args: [] }`

### 6. `back` / `forward` actions — Browser history navigation

```bash
firecode browse <page> back
firecode browse <page> forward
```

- Calls `page.goBack()` / `page.goForward()`
- Returns the new URL after navigation
- API: `POST /pages/:name/action` with `{ action: "back"|"forward", args: [] }`

### 7. `text` command — Get visible text content

```bash
firecode text <page>
```

- Returns `page.innerText('body')` — just the visible text, no structure
- Lighter than snapshot, good for reading content
- API: `GET /pages/:name/text`

## New Observability Commands

### 8. `console` command — Browser console logs

```bash
firecode console <page>
firecode console <page> --clear
```

- Server captures all console messages per page from the moment the page is created
- Stores them in a buffer per page: `{ type: "log"|"warn"|"error"|"info", text: string, timestamp: number }[]`
- `firecode console <page>` dumps the buffer to stdout, formatted as `[TYPE] message`
- `--clear` flag clears the buffer after dumping
- Errors and warnings are the most valuable — helps the agent catch React errors, unhandled promises, 404s, etc.
- API: `GET /pages/:name/console?clear=true|false`
- Implementation: `page.on("console", msg => buffer.push(...))` when page is created in PageManager

### 9. `network` command — Failed network requests

```bash
firecode network <page>
firecode network <page> --all
firecode network <page> --clear
```

- Server captures all network responses per page
- Default: only shows failed requests (status >= 400)
- `--all` shows all requests
- `--clear` clears the buffer after dumping
- Output format: `[STATUS] METHOD url` (e.g., `[404] GET /api/users`)
- API: `GET /pages/:name/network?all=true|false&clear=true|false`
- Implementation: `page.on("response", res => buffer.push(...))` when page is created

### 10. Screenshot comparison

```bash
firecode screenshot <page> [path] --diff <baseline-path>
```

- When `--diff` is provided, take a new screenshot and compare against the baseline
- Use pixel-by-pixel comparison (simple approach: compare PNG buffers, report % of pixels that differ)
- Output: `Changed: 3.2% of pixels differ` or `No changes detected`
- Save the diff image highlighting changed pixels if there are differences
- Useful for: "I changed the CSS, did it break the layout?"
- Keep it simple — no fancy perceptual diff, just pixel comparison via raw buffer comparison

## Phase 2: Test Mode

### CLI

```bash
firecode test [--target unstaged|branch|changes] [--base-url URL] [-m "instruction"] [-y]
```

- `--target`: git diff scope (default: `changes`)
  - `unstaged`: `git diff`
  - `branch`: `git diff main...HEAD`
  - `changes`: `git diff HEAD`
- `--base-url`: app URL (default: `http://localhost:3000`)
- `-m`: targeted test instruction
- `-y`: skip plan review

### Flow

1. Parse git diff via `simple-git`
2. Analyze changed files — categorize by type (component, route, API, style)
3. Generate test plan — template-based, map file patterns to test types
4. Show plan for review (skip with `-y`)
5. Generate Playwright `.spec.ts` files in `.firecode/tests/`
6. Run via Playwright programmatic API with Firefox config
7. Report pass/fail, clean up temp files

### testgen package structure

```
packages/testgen/
  src/
    diff.ts      — git diff parsing via simple-git
    analyze.ts   — categorize changes, extract details
    plan.ts      — generate test plan from analysis
    generate.ts  — produce .spec.ts files from templates
    run.ts       — execute tests, collect results
```

### Test templates

Map file patterns to test generators:
- `**/*.tsx`, `**/*.jsx` — component: test renders, interactions
- `**/routes/**`, `**/pages/**` — page: test navigation, content loads
- `**/api/**`, `**/server/**` — API: test endpoints respond, UI reflects data
- `**/*.css`, `**/*.scss` — style: screenshot comparison

Each template function takes `{ filePath, diff, baseUrl }` and returns a Playwright test string.

## Files Changed

### Modified
- `packages/server/src/api.ts` — new action cases (evaluate, scroll, wait-for, reload, back, forward), text/console/network endpoints, force flag parsing, screenshot diff
- `packages/server/src/types.ts` — add new ActionTypes, ConsoleEntry, NetworkEntry types
- `packages/server/src/pages.ts` — attach console/network listeners on page create, store buffers per page
- `packages/cli/src/commands/browse.ts` — parse `--force` flag, pass through
- `packages/cli/src/commands/screenshot.ts` — add `--diff` flag
- `packages/cli/src/index.ts` — register text, console, network, test commands

### New
- `packages/cli/src/commands/text.ts` — text command
- `packages/cli/src/commands/console.ts` — console command
- `packages/cli/src/commands/network.ts` — network command
- `packages/cli/src/commands/test.ts` — test command orchestration
- `packages/testgen/package.json`
- `packages/testgen/tsconfig.json`
- `packages/testgen/tsup.config.ts`
- `packages/testgen/src/diff.ts`
- `packages/testgen/src/analyze.ts`
- `packages/testgen/src/plan.ts`
- `packages/testgen/src/generate.ts`
- `packages/testgen/src/run.ts`
- `packages/testgen/src/index.ts`

### Updated
- `skills/firecode/SKILL.md` — document all new commands
