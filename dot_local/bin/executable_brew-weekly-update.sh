#!/usr/bin/env bash
# Weekly Homebrew maintenance, run headless by launchd. Individual failures
# (e.g. a cask upgrade that needs sudo) must not abort the rest of the run,
# so each step records its failure instead of exiting under set -e.
set -uo pipefail
eval "$(/opt/homebrew/bin/brew shellenv)"

# launchd gives this no login shell, so .zshrc never runs and the ghcr token it
# exports is absent here -- exactly the run that most needs it, since a throttled
# anonymous pull fails into a log nobody reads. See .zshrc for why this is
# Bearer-with-base64 and not the BASIC_AUTH variant.
if command -v gh >/dev/null 2>&1; then
  _tok="$(gh auth token 2>/dev/null | tr -d '\n' | base64 | tr -d '\n')"
  if [ -n "$_tok" ]; then
    export HOMEBREW_DOCKER_REGISTRY_TOKEN="$_tok"
  fi
  unset _tok
fi

echo "=== brew weekly update started $(date) ==="
rc=0
brew update || rc=$?
brew upgrade --formula || rc=$?
brew upgrade --cask || rc=$?
echo "=== brew weekly update finished $(date) (exit $rc) ==="
exit "$rc"
