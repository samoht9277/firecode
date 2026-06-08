#!/usr/bin/env bash
#
# firecode uninstaller — removes the PATH symlink and the Claude Code skill.
# Does not delete the repo or node_modules.
#
set -euo pipefail

BIN_DIR="${FIRECODE_BIN_DIR:-$HOME/.local/bin}"
SKILL_DIR="$HOME/.claude/skills/firecode"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }

# Stop any running server first (ignore failure).
if command -v firecode >/dev/null 2>&1; then
  firecode stop >/dev/null 2>&1 || true
fi

if [ -L "$BIN_DIR/firecode" ] || [ -f "$BIN_DIR/firecode" ]; then
  rm -f "$BIN_DIR/firecode"
  info "Removed $BIN_DIR/firecode"
fi

if [ -L "$SKILL_DIR" ] || [ -d "$SKILL_DIR" ]; then
  rm -rf "$SKILL_DIR"
  info "Removed $SKILL_DIR"
fi

# Clean up any leftover server state files.
rm -f "$HOME/.firecode/server"*.json 2>/dev/null || true

info "firecode uninstalled. Delete the repo folder to remove the rest."
