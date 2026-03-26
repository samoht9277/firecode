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
- `firecode browse <page> keyboard <key>` — press a key (e.g. ArrowRight, Enter, Space, Tab, Escape)

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
