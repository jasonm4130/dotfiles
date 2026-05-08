#!/usr/bin/env bash
# Render ~/.ai/AGENTS.md (+ tool-specific extras) into per-tool config files.
# Re-run automatically by chezmoi via run_onchange_after_07-agents-md-sync.
set -euo pipefail

AI_DIR="$HOME/.ai"

# Claude Code: AGENTS.md + claude-extras
mkdir -p "$HOME/.claude"
cat "$AI_DIR/AGENTS.md" "$AI_DIR/claude-extras.md" > "$HOME/.claude/CLAUDE.md"

# Codex: AGENTS.md + codex-extras (codex reads this filename directly)
mkdir -p "$HOME/.codex"
cat "$AI_DIR/AGENTS.md" "$AI_DIR/codex-extras.md" > "$HOME/.codex/AGENTS.md"

echo "✅ rendered AGENTS.md → ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md"
