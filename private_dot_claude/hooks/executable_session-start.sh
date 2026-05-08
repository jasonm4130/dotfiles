#!/usr/bin/env bash
# SessionStart hook — emits a session primer as additionalContext.
# Aggressive timeouts so a slow git or filesystem call can't delay session start.
set -uo pipefail

PROJECT="${CLAUDE_PROJECT_DIR:-$PWD}"

safe() { timeout 2 "$@" 2>/dev/null || true; }

primer=$(mktemp)
trap 'rm -f "$primer"' EXIT

{
  printf "## Session primer\n\n"
  printf "**Project:** \`%s\`\n" "$PROJECT"

  if (cd "$PROJECT" && git rev-parse --is-inside-work-tree >/dev/null 2>&1); then
    branch=$(safe git -C "$PROJECT" branch --show-current)
    [ -n "$branch" ] && printf "**Branch:** \`%s\`\n" "$branch"

    status_short=$(safe git -C "$PROJECT" status --short | head -10)
    if [ -n "$status_short" ]; then
      printf "\n**Working tree changes:**\n\`\`\`\n%s\n\`\`\`\n" "$status_short"
    fi

    log=$(safe git -C "$PROJECT" log -5 --oneline)
    if [ -n "$log" ]; then
      printf "\n**Recent commits:**\n\`\`\`\n%s\n\`\`\`\n" "$log"
    fi
  fi

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

  encoded=$(printf "%s" "$PROJECT" | sed 's|/|-|g')
  mem="$HOME/.claude/projects/$encoded/memory/MEMORY.md"
  if [ -f "$mem" ]; then
    printf "\n**Recent memory** (head 20 of MEMORY.md):\n"
    head -20 "$mem"
  fi
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
