#!/usr/bin/env bash
# Weekly Homebrew maintenance, run headless by launchd. Individual failures
# (e.g. a cask upgrade that needs sudo) must not abort the rest of the run,
# so each step records its failure instead of exiting under set -e.
set -uo pipefail
eval "$(/opt/homebrew/bin/brew shellenv)"

echo "=== brew weekly update started $(date) ==="
rc=0
brew update || rc=$?
brew upgrade --formula || rc=$?
brew upgrade --cask || rc=$?
echo "=== brew weekly update finished $(date) (exit $rc) ==="
exit "$rc"
