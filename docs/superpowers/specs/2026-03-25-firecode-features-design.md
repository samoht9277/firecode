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

### 5. `text` command — Get visible text content

```bash
firecode text <page>
```

- Returns `page.innerText('body')` — just the visible text, no structure
- Lighter than snapshot, good for reading content
- API: `GET /pages/:name/text`

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
- `packages/server/src/api.ts` — new action cases (evaluate, scroll, wait-for), text endpoint, force flag parsing
- `packages/server/src/types.ts` — add new ActionTypes
- `packages/cli/src/commands/browse.ts` — parse `--force` flag, pass through
- `packages/cli/src/index.ts` — register `text` and `test` commands

### New
- `packages/cli/src/commands/text.ts` — text command
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
- `skills/firecode/SKILL.md` — document new commands
