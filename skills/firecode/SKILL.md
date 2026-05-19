---
name: firecode
description: Browse websites with Firefox to verify your work, debug UI issues, and test web apps you're building. Use when working on web projects and you need to see what's on screen.
---

# Firecode — Browser Automation for Agents

You have access to a real Firefox browser via the `firecode` CLI. Use it to verify your work on web apps, debug UI issues, find bugs, and check that things look right, without asking the user to describe what they see.

Run commands with `firecode <command>` (shell alias is already configured).

If the server isn't running, it auto-starts in headless mode when you run any command.

## Running Multiple Instances

If you need to coexist with another agent already using firecode (same machine), set `FIRECODE_INSTANCE=<name>` for every command to get an isolated server with its own Firefox process, port, and state file. Example:

```bash
FIRECODE_INSTANCE=alpha firecode browse main navigate "http://localhost:3000"
FIRECODE_INSTANCE=alpha firecode snapshot main
FIRECODE_INSTANCE=alpha firecode stop
```

Default (no env var) keeps the legacy single-instance behavior. Each instance is fully isolated, including auth tokens.

## When to Use

- You just made changes to a web app and want to verify they work
- You need to debug a UI issue (layout broken, button not working, etc.)
- You want to check what a page looks like before and after your changes
- The user asks you to test or verify something in the browser
- You need to fill out a form, click through a flow, or interact with UI
- You want to catch JS errors or failed network requests

## Quick Start

```bash
# Navigate to the app (auto-starts server if needed)
firecode browse main navigate "http://localhost:3000"

# See what's on the page
firecode snapshot main

# Interact with elements using ref IDs from the snapshot
firecode browse main click e4
firecode browse main fill e5 "hello@example.com"

# Verify the result
firecode snapshot main

# Check for errors
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
- `firecode browse <page> evaluate "<js>"` — run JavaScript and get result. Supports `return` for multi-statement code (auto-wrapped in async IIFE), e.g. `evaluate "let x = 1; return x + 2"`.
- `firecode browse <page> scroll down|up|<ref>` — scroll page or to an element
- `firecode browse <page> wait-for "<text>"` — wait for text to appear
- `firecode browse <page> wait-for --selector "<css>" [--timeout ms]` — wait for selector
- `firecode browse <page> reload` — refresh the page
- `firecode browse <page> back` — go back in history
- `firecode browse <page> forward` — go forward in history
- `firecode browse <page> keyboard <key>` — press a key (e.g. ArrowRight, Enter, Space, Tab, Escape)
- `firecode browse <page> viewport mobile|tablet|desktop|<width> <height>` — set viewport size (presets: mobile=375x812, tablet=768x1024, desktop=1920x1080, desktop-hd=3840x2160)
- `firecode browse <page> click-text "<text>" [--soft]` — click by visible text (--soft won't fail if not found)
- `firecode browse <page> find-text "<text>"` — find text on page and show element info (non-destructive)
- `firecode browse <page> assert-text "<text>"` — check if text exists on page (fails with error if not found)
- `firecode browse <page> wait-idle` — wait for network to be idle (no pending requests)

### Observing
- `firecode snapshot <page> [--interactive]` — get ARIA accessibility tree with ref IDs (--interactive for only buttons/inputs/links)
- `firecode screenshot <page> [path]` — capture PNG screenshot
- `firecode screenshot <page> [path] --diff <baseline>` — pixel-level comparison against baseline, outputs diff image
- `firecode text <page>` — get visible text content (lighter than snapshot)
- `firecode console <page> [--clear]` — show browser console logs
- `firecode network <page> [--all] [--clear]` — show failed network requests
- `firecode cookies show <page>` — show cookies for the page (or just `firecode cookies <page>`)
- `firecode cookies set <page> <name> <value> --domain <domain> [--path /] [--expires N] [--http-only] [--secure] [--same-site Lax]` — set a cookie manually
- `firecode storage <page> [--session]` — show localStorage (or sessionStorage with --session)
- `firecode storage <page> --clear` — clear all storage (add --session to clear only sessionStorage)
- `firecode pdf <page> [path]` — export page as PDF (headless mode only)

### Auth
- `firecode auth <page> <domain>` — import cookies from the user's real Firefox into firecode (prompts the user for approval). Use this when a site needs login and you can't sign in directly. The user must approve in their terminal — you can't auto-confirm. Example: `firecode auth main github.com`

### Recording
- `firecode record start <page>` — start recording actions
- `firecode record stop <page>` — stop recording and show captured steps
- `firecode record save <page> <path>` — save recording to JSON file
- `firecode replay <page> <path>` — replay a saved recording

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
  - button [ref=e7]:
```

Named elements: `firecode browse main click e6` (clicks "Save")
Unnamed elements: `firecode browse main click e7` (clicks the unnamed button)

**Important:** Refs are content-hashed (e.g. `e17e5`, `e340a`) and stable across snapshots — same element keeps the same ref. But refs are still per-snapshot session: you need at least one snapshot before refs can resolve, and if an element is removed/replaced the ref becomes invalid.

## Debugging Workflow

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

# 5. Check cookies/storage if debugging auth or state
firecode cookies app
firecode storage app

# 6. After making a fix, reload and check again
firecode browse app reload
firecode console app --clear
firecode snapshot app
```

## Visual Regression Testing

```bash
# Take a baseline screenshot
firecode screenshot app /tmp/before.png

# Make your changes, then compare
firecode screenshot app /tmp/after.png --diff /tmp/before.png
# Output: "Changed: 2.3% (1847/80000 pixels differ)"
# Diff image saved to /tmp/after-diff.png with changed pixels highlighted
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
- **Test responsive layouts.** `firecode browse main viewport mobile` then take a screenshot.
- **If a ref fails,** the page probably changed. Take a fresh snapshot.
