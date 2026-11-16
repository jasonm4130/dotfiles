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
# Casks that update themselves (auto_updates true: Chrome, Signal, Obsidian...)
# are left to their own updaters. brew replaces an app by deleting the bundle
# and moving the new one in, which breaks a running Chrome: its old version
# directory vanishes, so every new tab's renderer fails to launch (sad-tab) until
# a relaunch. Current brew lists these as outdated even without --greedy.
outdated="$(brew outdated --cask --quiet)" || rc=$?
manual=()
if [ -n "$outdated" ]; then
  # shellcheck disable=SC2086 # word-split the token list on purpose
  while IFS= read -r token; do
    [ -n "$token" ] && manual+=("$token")
  done < <(brew info --cask --json=v2 $outdated | jq -r '.casks[] | select(.auto_updates != true) | .token') || rc=$?
  echo "Skipping self-updating casks: $(brew info --cask --json=v2 $outdated | jq -r '[.casks[] | select(.auto_updates == true) | .token] | join(" ")')"
fi
if [ "${#manual[@]}" -gt 0 ]; then
  brew upgrade --cask "${manual[@]}" || rc=$?
fi
echo "=== brew weekly update finished $(date) (exit $rc) ==="
exit "$rc"
