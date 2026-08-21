#!/usr/bin/env bash
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
if xcode-select -p >/dev/null 2>&1; then
  echo "✅ Xcode CLT already installed"
  exit 0
fi
echo "📥 Installing Xcode Command Line Tools..."
xcode-select --install
# Block until install finishes (check every 10s, max 30 min)
for _ in $(seq 1 180); do
  xcode-select -p >/dev/null 2>&1 && break
  sleep 10
done
xcode-select -p >/dev/null 2>&1 || { echo "❌ Xcode CLT install timed out"; exit 1; }
echo "✅ Xcode CLT installed"
