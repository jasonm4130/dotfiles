#!/usr/bin/env bash
set -euo pipefail
if command -v brew >/dev/null 2>&1; then
  echo "✅ Homebrew already installed at $(brew --prefix)"
  exit 0
fi
# NONINTERACTIVE=1 makes Homebrew's installer probe with `sudo -n` (see
# have_sudo_access() in install.sh), which cannot prompt — so with no cached
# sudo timestamp it aborts "Need sudo access on macOS" and the script exits 1
# before printing anything of its own. Prime the timestamp first; `sudo -v`
# prompts when a terminal is attached and fails loudly when one isn't.
if ! sudo -n true 2>/dev/null; then
  echo "🔑 Homebrew's installer needs sudo — caching credentials now..."
  sudo -v || {
    echo "❌ Could not obtain sudo. Run 'sudo -v' in a terminal, then re-run 'chezmoi apply'." >&2
    exit 1
  }
fi
echo "📥 Installing Homebrew..."
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# Activate brew in current script's env
eval "$(/opt/homebrew/bin/brew shellenv)"
echo "✅ Homebrew installed at $(brew --prefix)"
