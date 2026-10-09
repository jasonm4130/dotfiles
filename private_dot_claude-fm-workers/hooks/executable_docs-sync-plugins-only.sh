#!/usr/bin/env bash
# PreToolUse guard for firstmate fleet sessions: the gates plugin's docs-sync gate, narrowed
# to the plugin monorepo it was built for. gates 0.1.0 denied a commit that changed a plugin's
# code without that plugin's README.md or CLAUDE.md; 0.2.0 added a covering-doc rule for any
# repo, which drew 96 of the fleet's 97 docs-sync denials.
# The fm-workers env sets GATES_DISABLE=docs-sync, turning the plugin's own registration off;
# this hook re-runs the same script only in a repository with the plugins/ monorepo layout
# (.claude-plugin/marketplace.json beside plugins/), such as claude-skills.
# Fails open like the plugin: no commit, no repo or no installed plugin means allow.
set -uo pipefail
payload=$(cat)
case $payload in *commit*) ;; *) exit 0 ;; esac
cwd=$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("cwd") or ".")' 2>/dev/null) || exit 0
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$root/.claude-plugin/marketplace.json" ] && [ -d "$root/plugins" ] || exit 0
installed="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/installed_plugins.json"
plugin=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["plugins"]["gates@jasonm4130-claude-skills"][0]["installPath"])' "$installed" 2>/dev/null) || exit 0
script="$plugin/scripts/pretooluse-guard-docs-sync.mjs"
[ -f "$script" ] || exit 0
# Re-enable docs-sync for this one run, keeping any other gate the session turned off.
enabled=$(printf '%s' "${GATES_DISABLE:-}" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -vx 'docs-sync' | paste -sd, -)
printf '%s' "$payload" | GATES_DISABLE="$enabled" node "$script"
