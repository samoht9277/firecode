# Firecode TODOs

## Edge Cases & Robustness

- [ ] **iframe support** — snapshot/click don't work inside iframes. Need `firecode browse main frame <selector>` to switch context, or auto-detect and include iframe content in snapshots
- [ ] **Shadow DOM** — ARIA snapshots might miss elements inside shadow roots. Need to test and handle `open` shadow DOMs
- [ ] **File upload dialogs** — `page.setInputFiles()` exists in Playwright but we have no action for it. Need `firecode browse main upload <ref> <filepath>`
- [ ] **Auth redirects** — navigating to a page that redirects (OAuth, SSO) loses the page context. Need to handle `waitUntil: "networkidle"` or follow redirects gracefully
- [ ] **Websocket-heavy apps** — `wait-idle` only checks HTTP network idle, not websocket connections. Apps using websockets (chat, real-time) will never be "idle"
- [ ] **Pages that never idle** — analytics, polling, long-polling. `wait-idle` times out on these. Need a `wait-idle --ignore <pattern>` to exclude URLs
- [ ] **Multiple matching elements** — `getByRole` with a name can match multiple elements. We use `.first()` but should handle ambiguity better (warn the agent, show all matches)
- [ ] **Alert/confirm/prompt dialogs** — Playwright auto-dismisses these. Need `page.on("dialog")` handler and a way to accept/dismiss with input
- [ ] **Download handling** — no way to trigger/capture file downloads. Need `firecode browse main download <ref> [path]`
- [ ] **Tab crashes** — if a page crashes (OOM, infinite loop), the page handle becomes stale. Need detection and cleanup
- [ ] **Server crash recovery** — if the Fastify server crashes but Firefox stays alive, we lose the HTTP API but the browser is still there. Could reconnect

## Performance

- [ ] **Parallel snapshot+console+network** — agent often runs snapshot then console then network sequentially. A `firecode check <page>` that returns all three at once would save 2 round trips
- [ ] **Snapshot caching** — if the page hasn't changed since last snapshot, return cached version. Use DOM mutation observer to detect changes
- [ ] **Incremental snapshots** — only return what changed since the last snapshot (like Playwright's `track` option on `snapshotForAI`). Saves tokens on large pages
- [ ] **Connection pooling** — each CLI invocation creates a new HTTP connection. Keep-alive or unix socket would be faster
- [ ] **Startup time** — 50ms is good but could be better. Consider pre-compiling with `bun build --compile` for near-instant startup

## Developer Experience

- [ ] **`firecode init`** — generate a `firecode.config.json` per project with default base URL, viewport, headless preference
- [ ] **`firecode pages`** — alias for `firecode status` that just shows pages (cleaner output)
- [ ] **`firecode close <page>`** — close a specific tab
- [ ] **`firecode close --all`** — close all tabs
- [ ] **Tab auto-naming** — if you don't provide a page name, auto-generate one from the URL hostname
- [ ] **Error context** — when click/fill fails, include the current page URL and a mini-snapshot of the area around the target element
- [ ] **`--json` flag** — output all commands as JSON for machine consumption (useful when other tools wrap firecode)
- [ ] **`--quiet` flag** — suppress info messages, only output data (for piping)
- [ ] **`--timeout` global flag** — override default timeouts for all actions in a single invocation
- [ ] **Fish/Zsh completions** — shell completions for commands, page names, and action types

## Visual Testing

- [ ] **Perceptual diff threshold** — `--diff` currently reports any pixel change. Add `--threshold 0.5%` to allow minor anti-aliasing differences
- [ ] **Diff report HTML** — generate an HTML report showing baseline, current, and diff side-by-side
- [ ] **Screenshot regions** — `firecode screenshot main --selector ".header"` to capture just a portion of the page
- [ ] **Responsive matrix** — `firecode screenshot main --responsive` takes screenshots at mobile/tablet/desktop in one command
- [ ] **Golden file management** — store baseline screenshots in a `.firecode/baselines/` directory, auto-update with `--update`

## Test Mode (Phase 2 improvements)

- [ ] **Smarter test generation** — current templates are generic stubs. Use Claude API to generate meaningful tests from the actual diff content
- [ ] **Playwright config** — auto-generate `playwright.config.ts` for the target project if one doesn't exist
- [ ] **Watch mode** — `firecode test --watch` re-runs tests on file changes
- [ ] **Test report** — save results to `.firecode/reports/` with timestamps for history
- [ ] **Coverage integration** — show which changed lines are covered by the generated tests
- [ ] **Component-specific tests** — detect Storybook/component playground and test individual components in isolation

## Recording & Replay

- [ ] **Human-readable format** — recordings are JSON, but could also export as a shell script of firecode commands
- [ ] **Replay with assertions** — `firecode replay main flow.json --assert` takes snapshots after each step and fails if the page changed unexpectedly
- [ ] **Recording editor** — `firecode record edit flow.json` to view/modify/delete steps
- [ ] **Named recordings** — `firecode record save main signup-flow` stores in `.firecode/recordings/signup-flow.json`
- [ ] **Replay speed** — `firecode replay main flow.json --delay 500` to slow down replay for debugging

## Multi-Instance / Collaboration

- [ ] **Per-project server instances** — right now only one firecode server can run globally. Support per-project instances with different ports
- [ ] **Concurrent agent support** — multiple agents sharing the same server need page-level locking to avoid conflicts
- [ ] **Remote server** — `firecode connect <host:port>` to control a remote Firefox instance (useful for testing on different machines)

## Platform & Browser

- [ ] **Linux headless CI** — test and document running in CI environments (GitHub Actions, etc.)
- [ ] **Chromium fallback** — (controversial) some sites only work in Chrome. Optional `--chromium` flag?
- [ ] **Mobile emulation** — viewport presets exist but don't set touch/user-agent. Full device emulation with `browser.newContext({ ...devices['iPhone 13'] })`
- [ ] **Geolocation/permissions** — `firecode browse main geolocation 40.7 -74.0` for location-based testing
- [ ] **Dark mode** — `firecode browse main color-scheme dark` to test dark mode without changing system settings

## Observability

- [ ] **Performance metrics** — Core Web Vitals (LCP, FID, CLS) via `page.evaluate` + PerformanceObserver
- [ ] **Accessibility audit** — run axe-core and report violations. `firecode audit <page>`
- [ ] **HAR export** — `firecode har <page> [path]` to export network activity as HAR file
- [ ] **Coverage report** — CSS/JS coverage via `page.coverage`. Show unused code percentages
