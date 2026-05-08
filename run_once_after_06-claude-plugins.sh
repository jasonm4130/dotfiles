#!/usr/bin/env bash
set -euo pipefail

# Pre-register Claude marketplaces for headless install (the cask reads its own state).
# This is mostly a placeholder; the actual marketplaces are referenced from
# ~/.claude/settings.json which is already in place by this point.

# gh CLI extensions (idempotent — `gh extension install` errors if already installed; swallow)
if command -v gh >/dev/null 2>&1; then
  : # add `gh extension install <ext>` lines here as needed; none today
fi

echo "✅ claude plugins / gh extensions phase complete"
