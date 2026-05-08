#!/usr/bin/env bash
set -euo pipefail
if command -v brew >/dev/null 2>&1; then
  echo "✅ Homebrew already installed at $(brew --prefix)"
  exit 0
fi
echo "📥 Installing Homebrew..."
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# Activate brew in current script's env
eval "$(/opt/homebrew/bin/brew shellenv)"
echo "✅ Homebrew installed at $(brew --prefix)"
