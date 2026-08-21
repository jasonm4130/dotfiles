#!/usr/bin/env bash
# Local entry point. Most setups should use the curl-pipe-sh one-liner from README.
# This script is for: "I cloned the repo, now what?"
set -euo pipefail

# macOS sudoers keeps HOME, so `sudo chezmoi apply` writes root-owned files
# straight into the real home directory — including chezmoi's own config, which
# then fails to open as "invalid config: ...: permission denied" on every later
# non-root run. Refuse before anything gets written.
if [ "$(id -u)" -eq 0 ]; then
  echo "❌ Do not run this as root. chezmoi would write root-owned files into $HOME." >&2
  echo "   Re-run without sudo — 01-homebrew.sh asks for a password itself when it needs one." >&2
  exit 1
fi

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
