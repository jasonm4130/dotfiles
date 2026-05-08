#!/usr/bin/env bash
set -euo pipefail
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
