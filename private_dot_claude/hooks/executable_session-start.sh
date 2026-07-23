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
      # Most-recent first; -p marks dirs with a trailing / so archive/ is excluded
      plans=$(ls -1tp "$d" 2>/dev/null | grep -v '/' | grep -v '^\.' | head -5)
      if [ -n "$plans" ]; then
        rel="${d/#$HOME/~}"
        printf "\n**Active plans in \`%s\`:**\n" "$rel"
        printf "%s\n" "$plans" | sed 's/^/- /'
      fi
    fi
  done

  # Session-control commands the model cannot invoke itself — without this it
  # never offers them, and the moment to use them has passed by the next turn.
  cat <<'EOF'

**Session control — offer these to the user at the right moment; you cannot invoke them yourself.**
Offer at most one, as a single line alongside the work, then keep going. Never stall waiting for an answer, and never re-offer for a moment already passed on.
1. `/rewind` — the user wants to undo work you just did that spans several files and isn't committed. NOT for a single edit you can simply re-edit, and not when a git operation is cleaner.
2. `/branch` — the user is choosing between two substantive paths and the context built so far is expensive to rebuild. NOT for trivial either/ors.
3. `/fork` — a tangent opens that needs everything already in this conversation but shouldn't be spent inside it.
EOF
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
