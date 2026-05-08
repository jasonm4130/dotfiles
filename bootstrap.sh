#!/usr/bin/env bash
# Local entry point. Most setups should use the curl-pipe-sh one-liner from README.
# This script is for: "I cloned the repo, now what?"
set -euo pipefail

if [ -d "$HOME/.local/share/chezmoi/.git" ]; then
  echo "❌ chezmoi source already exists at ~/.local/share/chezmoi"
  echo "   This script refuses to clobber an existing install."
  echo "   Use 'chezmoi update' or 'chezmoi git -- pull' instead."
  exit 1
fi

if ! command -v chezmoi >/dev/null 2>&1; then
  echo "📥 Installing chezmoi..."
  sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
fi

# Use the script's own directory as the source
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chezmoi init --source "$SCRIPT_DIR" --apply
