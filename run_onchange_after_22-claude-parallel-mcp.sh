#!/usr/bin/env bash
# Registers the Parallel search MCP server for Claude Code (user scope, ~/.claude.json,
# which chezmoi does not manage). The key never lands in config: headersHelper reads it
# from 1Password at connect time (~/.claude/mcp/parallel-headers.sh). Idempotent.
set -euo pipefail
command -v claude >/dev/null 2>&1 || { echo "⏭  parallel mcp: claude not on PATH" >&2; exit 0; }
claude mcp remove parallel -s user >/dev/null 2>&1 || true
claude mcp add-json parallel -s user \
  "{\"type\":\"http\",\"url\":\"https://search-mcp.parallel.ai/mcp\",\"headersHelper\":\"$HOME/.claude/mcp/parallel-headers.sh\"}"
