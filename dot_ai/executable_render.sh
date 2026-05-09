#!/usr/bin/env bash
# Render ~/.ai/AGENTS.md into per-tool config files.
# Re-run automatically by chezmoi via run_onchange_after_07-agents-md-sync.
set -euo pipefail

AI_DIR="$HOME/.ai"

# Claude Code reads ~/.claude/CLAUDE.md
mkdir -p "$HOME/.claude"
cp "$AI_DIR/AGENTS.md" "$HOME/.claude/CLAUDE.md"

# Codex reads ~/.codex/AGENTS.md
mkdir -p "$HOME/.codex"
cp "$AI_DIR/AGENTS.md" "$HOME/.codex/AGENTS.md"

echo "✅ rendered AGENTS.md → ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md"
