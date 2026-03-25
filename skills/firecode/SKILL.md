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
