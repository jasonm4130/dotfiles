#!/usr/bin/env bash
# Monthly disk maintenance: trim regenerable build artifacts and package caches.
# Scheduled via ~/Library/LaunchAgents/com.jasonmatthew.disk-maintenance.plist
set -uo pipefail

# launchd runs with a minimal PATH; add the locations of the tools we call.
export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$HOME/.local/share/mise/shims:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

GITROOT="$HOME/Work/Git"
IDLE_DAYS=30

echo "=========================================="
echo "disk-maintenance run: $(date)"
df -h /System/Volumes/Data | tail -1

# 1. Rust: drop build artifacts not used in IDLE_DAYS (keeps recent builds fast).
if command -v cargo-sweep >/dev/null 2>&1; then
  echo "--- cargo sweep (stale > ${IDLE_DAYS}d) ---"
  cargo sweep --time "$IDLE_DAYS" -r "$GITROOT" 2>&1 || true
  # Also sweep the shared target dir directly.
  [ -d "$HOME/.cache/cargo" ] && cargo sweep --time "$IDLE_DAYS" -r "$HOME/.cache/cargo" 2>&1 || true
else
  echo "--- cargo-sweep not installed, skipping Rust sweep ---"
fi

# 2. Node: remove node_modules in repos that are idle (last commit > IDLE_DAYS ago)
#    and have no uncommitted changes (so active work is never touched).
echo "--- pruning node_modules in idle repos ---"
now=$(date +%s)
for repo in "$GITROOT"/*/; do
  nm="${repo}node_modules"
  [ -d "$nm" ] || continue
  [ -d "${repo}.git" ] || continue
  # Skip repos with uncommitted changes (active work).
  if [ -n "$(git -C "$repo" status --porcelain 2>/dev/null)" ]; then
    continue
  fi
  last=$(git -C "$repo" log -1 --format=%ct 2>/dev/null || echo 0)
  [ "$last" -gt 0 ] || continue
  age_days=$(( (now - last) / 86400 ))
  if [ "$age_days" -ge "$IDLE_DAYS" ]; then
    echo "  removing node_modules (idle ${age_days}d): $nm"
    rm -rf "$nm"
  fi
done

# 3. pnpm: drop unreferenced packages from the global store.
if command -v pnpm >/dev/null 2>&1; then
  echo "--- pnpm store prune ---"
  pnpm store prune 2>&1 || true
fi

# 4. Homebrew: remove old downloads and outdated bottles.
if command -v brew >/dev/null 2>&1; then
  echo "--- brew cleanup ---"
  brew cleanup -s 2>&1 || true
fi

echo "done: $(date)"
df -h /System/Volumes/Data | tail -1
echo "=========================================="
