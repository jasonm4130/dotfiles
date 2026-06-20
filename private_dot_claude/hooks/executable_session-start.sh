#!/usr/bin/env bash
# SessionStart hook — emits a session primer as additionalContext.
# Only surfaces what Claude Code does NOT already inject natively: active plan
# files. Branch, status, recent commits, and MEMORY.md are covered by the
# native gitStatus snapshot and memory system — repeating them wastes context.
set -uo pipefail

PROJECT="${CLAUDE_PROJECT_DIR:-$PWD}"

primer=$(mktemp)
trap 'rm -f "$primer"' EXIT

{
  # Low-disk early warning — heavy multi-agent Rust builds can silently fill
  # the volume and wedge the harness (it can't write tool-output once at 100%).
  [ -x "$HOME/.claude/hooks/disk-guard.sh" ] && "$HOME/.claude/hooks/disk-guard.sh" check 2>/dev/null

  for d in "$PROJECT/docs/plans" "$PROJECT/.claude/plans" "$HOME/.claude/plans"; do
    if [ -d "$d" ]; then
      plans=$(ls -1 "$d" 2>/dev/null | grep -v '^\.' | head -5)
      if [ -n "$plans" ]; then
        rel="${d/#$HOME/~}"
        printf "\n**Active plans in \`%s\`:**\n" "$rel"
        printf "%s\n" "$plans" | sed 's/^/- /'
      fi
    fi
  done
} > "$primer"

# Wrap in JSON with hookSpecificOutput.additionalContext
python3 -c "
import json, sys
ctx = open('$primer').read().strip()
if ctx:
    print(json.dumps({
        'hookSpecificOutput': {
            'hookEventName': 'SessionStart',
            'additionalContext': ctx
        }
    }))
"
