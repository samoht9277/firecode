# firecode

Browser automation for AI agents. Gives Claude Code (and other AI coding tools) autonomous access to a real Firefox browser so they can verify their own work, debug UI issues, and test web apps without asking you what's on screen.

## What it does

You're building a web app with an AI agent. Instead of you being the middleman ("what does the page look like?", "is the button there?", "any errors?"), the agent launches Firefox, navigates to your app, reads the page via ARIA snapshots, clicks buttons, fills forms, checks for console errors and failed network requests, takes screenshots, and verifies everything works. Autonomously.

```
You: "build a signup page and make sure it works"

Agent: *writes the code*
Agent: firecode browse app navigate "http://localhost:3000/signup"
Agent: firecode snapshot app
       → sees textbox "Email" [ref=e3], button "Sign Up" [ref=e5]
Agent: firecode browse app fill e3 "test@example.com"
Agent: firecode browse app click e5
Agent: firecode snapshot app
       → sees "Welcome! Check your email."
Agent: firecode console app
       → No console errors
Agent: firecode network app
       → No failed requests
Agent: "signup page is working, no errors"
```

## Install

**Prerequisites:** [Node.js](https://nodejs.org) 20+ and [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`).

### macOS / Linux

```bash
git clone https://github.com/samoht9277/firecode.git
cd firecode
./install.sh
```

### Windows (PowerShell)

```powershell
git clone https://github.com/samoht9277/firecode.git
cd firecode
./install.ps1
```

The installer builds the CLI, downloads the Playwright Firefox browser, puts `firecode` on your PATH, and installs the Claude Code skill. Pass `--no-skill` (bash) or `-NoSkill` (PowerShell) to skip the skill.

> If `firecode` isn't found after install, open a new terminal (the installer added a directory to your PATH). On macOS/Linux that's `~/.local/bin` — make sure it's on your PATH.

**Using it with Claude Code:** the installer symlinks the skill into `~/.claude/skills/firecode`. In any Claude Code session, just ask Claude to verify something in the browser (e.g. *"open localhost:3000 and check the signup flow works"*) and it'll use firecode automatically.

### Manual install

If you'd rather not run the script:

```bash
pnpm install
pnpm build
pnpm --filter @firecode/server exec playwright install firefox
# put packages/cli/dist/index.js on your PATH as `firecode`, e.g.:
ln -sf "$(pwd)/packages/cli/dist/index.js" ~/.local/bin/firecode
# (optional) install the Claude Code skill:
ln -sfn "$(pwd)/skills/firecode" ~/.claude/skills/firecode
```

### Uninstall

```bash
./uninstall.sh      # macOS / Linux
./uninstall.ps1     # Windows
```

## Quick start

```bash
# Start Firefox (auto-starts in headless mode if you skip this)
firecode start

# Navigate to your app
firecode browse main navigate "http://localhost:3000"

# See the page structure
firecode snapshot main

# Interact using ref IDs from the snapshot
firecode browse main click e4
firecode browse main fill e5 "hello@example.com"

# Check for problems
firecode console main          # JS errors, warnings
firecode network main          # failed HTTP requests
firecode screenshot main       # visual check

# Done
firecode stop
```

## Commands

### Server

| Command | Description |
|---------|-------------|
| `firecode start [--headless]` | Launch Firefox and start the server |
| `firecode stop` | Shut down (force kills if unresponsive) |
| `firecode status` | Show server state and open pages |

### Browsing

| Command | Description |
|---------|-------------|
| `browse <page> navigate <url>` | Go to a URL (creates page if needed) |
| `browse <page> click <ref> [--force]` | Click an element by ref ID |
| `browse <page> fill <ref> <value>` | Clear and fill a text input |
| `browse <page> type <ref> <text>` | Type text character by character |
| `browse <page> select <ref> <value>` | Select a dropdown option |
| `browse <page> hover <ref>` | Hover over an element |
| `browse <page> click-text "<text>"` | Click by visible text (no snapshot needed) |
| `browse <page> keyboard <key>` | Press a key (ArrowRight, Enter, Tab, etc.) |
| `browse <page> scroll down\|up\|<ref>` | Scroll the page or to an element |
| `browse <page> evaluate "<js>"` | Run JavaScript and get the result |
| `browse <page> viewport mobile\|tablet\|desktop\|<w> <h>` | Set viewport size |
| `browse <page> reload` | Refresh the page |
| `browse <page> back` / `forward` | Browser history navigation |
| `browse <page> wait <ms>` | Wait for a duration |
| `browse <page> wait-for "<text>"` | Wait for text to appear |
| `browse <page> wait-idle` | Wait for network to be idle |
| `browse <page> assert-text "<text>"` | Check if text exists (fails if not) |

### Observing

| Command | Description |
|---------|-------------|
| `snapshot <page>` | ARIA accessibility tree with ref IDs |
| `screenshot <page> [path]` | Capture PNG |
| `screenshot <page> [path] --diff <baseline>` | Pixel-level visual comparison |
| `text <page>` | Visible text content (lighter than snapshot) |
| `console <page> [--clear]` | Browser console logs |
| `network <page> [--all] [--clear]` | Network requests (failures by default) |
| `cookies <page>` | Page cookies |
| `storage <page> [--session] [--clear]` | localStorage/sessionStorage |
| `pdf <page> [path]` | Export page as PDF (headless only) |

### Recording

| Command | Description |
|---------|-------------|
| `record start <page>` | Start recording actions |
| `record stop <page>` | Stop and show captured steps |
| `record save <page> <path>` | Save recording to JSON |
| `replay <page> <path>` | Replay a saved recording |

### Testing

| Command | Description |
|---------|-------------|
| `test [--target unstaged\|branch\|changes]` | Generate and run tests from git diff |
| `test --base-url <url>` | Set app URL (default: localhost:3000) |
| `test -y` | Skip plan review |

## How snapshots work

`firecode snapshot` returns a YAML-like accessibility tree. Interactive elements get `[ref=eN]` tags:

```yaml
- navigation:
  - link "Dashboard" [ref=e1]
  - link "Settings" [ref=e2]
- main:
  - heading "Profile" [ref=e3]
  - textbox "Name" [ref=e4]
  - button "Save" [ref=e5]
  - button [ref=e6]:
```

Use refs to interact: `firecode browse main click e5` clicks "Save". Unnamed elements (like buttons with HTML content) also get refs.

Refs are tied to the last snapshot. If the page changes, take a new snapshot.

## Viewport presets

| Preset | Size |
|--------|------|
| `mobile` | 375x812 |
| `tablet` | 768x1024 |
| `desktop` | 1920x1080 |
| `desktop-hd` | 3840x2160 |

Or custom: `firecode browse main viewport 1440 900`

## Visual regression testing

```bash
# Take a baseline
firecode screenshot app /tmp/before.png

# Make changes, then compare
firecode screenshot app /tmp/after.png --diff /tmp/before.png
# → "Changed: 2.3% (1847/80000 pixels differ)"
# → Diff image saved to /tmp/after-diff.png
```

## Auto-start

If the server isn't running when you run a command, it auto-starts in headless mode. No need to manually `firecode start` every time.

## Architecture

```
firecode/
  packages/
    server/     Playwright Firefox + Fastify HTTP API
    cli/        Commander.js CLI
    testgen/    Git diff → test generation
  skills/
    firecode/   Claude Code skill instructions
```

Single Firefox instance, one OS window with tabs. The CLI talks to the server over HTTP. State file at `~/.firecode/server.json`.

## Built with

- [Playwright](https://playwright.dev/) (Firefox)
- [Fastify](https://fastify.dev/)
- [Commander.js](https://github.com/tj/commander.js)
- [pixelmatch](https://github.com/mapbox/pixelmatch)
- TypeScript, pnpm, turbo

## Why Firefox?

Because we're Firefox loyalists. No Chromium fallback, no browser selection flag.

## Running two agents at once

Each firecode server is isolated by instance. To run two Claude sessions against firecode on the same machine without collisions, set `FIRECODE_INSTANCE` per session:

```bash
FIRECODE_INSTANCE=projectA firecode browse main navigate "http://localhost:3000"
FIRECODE_INSTANCE=projectB firecode browse main navigate "http://localhost:4000"
```

Each instance gets its own Firefox process, port, auth token, and pages.

## License

MIT — see [LICENSE](LICENSE).
