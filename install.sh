#!/usr/bin/env bash
#
# firecode installer
#   - builds the CLI
#   - downloads the Playwright Firefox browser
#   - puts `firecode` on your PATH
#   - installs the Claude Code skill (optional)
#
# Usage:
#   ./install.sh                # full install
#   ./install.sh --no-skill     # skip the Claude Code skill
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SKILL=1
BIN_DIR="${FIRECODE_BIN_DIR:-$HOME/.local/bin}"
SKILL_DIR="$HOME/.claude/skills/firecode"

for arg in "$@"; do
  case "$arg" in
    --no-skill) INSTALL_SKILL=0 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -20
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# --- prerequisites ---------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20+ (https://nodejs.org)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20+ required (found $(node --version))."

if ! command -v pnpm >/dev/null 2>&1; then
  die "pnpm not found. Install it with: npm install -g pnpm  (or https://pnpm.io/installation)"
fi

# --- build -----------------------------------------------------------------
info "Installing dependencies..."
( cd "$REPO_DIR" && pnpm install )

info "Building firecode..."
( cd "$REPO_DIR" && pnpm build )

info "Downloading the Playwright Firefox browser (this can take a minute)..."
( cd "$REPO_DIR" && pnpm --filter @firecode/server exec playwright install firefox )

# --- link the binary -------------------------------------------------------
CLI_ENTRY="$REPO_DIR/packages/cli/dist/index.js"
[ -f "$CLI_ENTRY" ] || die "Build did not produce $CLI_ENTRY"
chmod +x "$CLI_ENTRY"

mkdir -p "$BIN_DIR"
ln -sf "$CLI_ENTRY" "$BIN_DIR/firecode"
info "Linked: $BIN_DIR/firecode -> $CLI_ENTRY"

if ! command -v firecode >/dev/null 2>&1; then
  warn "$BIN_DIR is not on your PATH. Add this to your shell profile:"
  printf '\n    export PATH="%s:$PATH"\n\n' "$BIN_DIR"
fi

# --- install the Claude Code skill ----------------------------------------
if [ "$INSTALL_SKILL" -eq 1 ]; then
  if [ -d "$REPO_DIR/skills/firecode" ]; then
    mkdir -p "$(dirname "$SKILL_DIR")"
    ln -sfn "$REPO_DIR/skills/firecode" "$SKILL_DIR"
    info "Installed Claude Code skill: $SKILL_DIR (symlink, updates with git pull)"
  else
    warn "skills/firecode not found, skipping skill install."
  fi
fi

# --- done ------------------------------------------------------------------
info "Done. Try it:"
echo ""
echo "    firecode browse main navigate \"https://example.com\""
echo "    firecode snapshot main"
echo "    firecode stop"
echo ""
