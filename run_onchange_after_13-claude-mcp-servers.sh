#!/usr/bin/env bash
set -euo pipefail

# ── Global (user-scope) MCP servers for Claude Code ──────────────────────────
# Source of truth for MCP servers that should be available in EVERY project on
# this machine. Registered into ~/.claude.json ("mcpServers") via
# `claude mcp add -s user`.
#
# This is a run_onchange script: edit it (add/remove a line) and the next
# `chezmoi apply` reconciles the set. Registration is add-if-missing, so it is
# idempotent and never disturbs an already-working server. To CHANGE an existing
# server's definition, `claude mcp remove <name> -s user` first, then re-apply.
#
# NB: ~/.claude/.mcp.json is NOT read by Claude Code for user scope — this
# script, not that file, is the mechanism.

if ! command -v claude >/dev/null 2>&1; then
  echo "⏭  claude CLI not found; skipping user-scope MCP registration"
  exit 0
fi

# add "$name" at user scope only if it isn't already registered (any scope)
ensure() {
  local name="$1"; shift
  if claude mcp get "$name" >/dev/null 2>&1; then
    echo "✓ $name already registered"
    return 0
  fi
  claude mcp add "$name" -s user "$@"
}

# API keys are pulled from the macOS keychain at launch time — the $(...) and
# "$USER" are single-quoted so they stay literal here and evaluate per-launch.
ensure exa    -- sh -c 'EXA_API_KEY=$(security find-generic-password -a "$USER" -s exa-api-key -w) npx -y exa-mcp-server'
ensure tavily -- sh -c 'TAVILY_API_KEY=$(security find-generic-password -a "$USER" -s tavily-api-key -w) npx -y tavily-mcp'
ensure social --transport http https://social-mcp.jasonmatthew.dev/mcp
ensure chrome-devtools -- npx chrome-devtools-mcp@latest

echo "✅ Claude user-scope MCP servers reconciled"
