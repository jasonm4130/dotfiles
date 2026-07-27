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

  # Agent-config staleness. AGENTS.md carries a marker:
  #   <!-- config-review: tuned_for=opus-5 review_after=YYYY-MM-DD last_checked=YYYY-MM-DD -->
  # Deliberately NOT a scheduled job: a previous weekly launchd automation got
  # deleted for firing regardless of need. This is silent until the date passes,
  # then nudges at most weekly, and never starts the review itself.
  agents_file="${CLAUDE_AGENTS_FILE:-$HOME/.ai/AGENTS.md}"
  ack_file="${CLAUDE_CONFIG_REVIEW_ACK:-$HOME/.claude/.config-review-ack}"
  if [ -r "$agents_file" ]; then
    marker=$(grep -o '<!-- config-review:[^>]*-->' "$agents_file" 2>/dev/null | head -1)
    review_after=$(printf '%s' "$marker" | sed -n 's/.*review_after=\([0-9-]*\).*/\1/p')
    tuned_for=$(printf '%s' "$marker" | sed -n 's/.*tuned_for=\([^ ]*\).*/\1/p')
    today=$(date +%F)
    # String compare is safe for zero-padded YYYY-MM-DD.
    if [ -n "$review_after" ] && [ "$today" \> "$review_after" ]; then
      last_nudge=$(sed -n "s/^${review_after}|//p" "$ack_file" 2>/dev/null | head -1)
      week_ago=$(date -v-7d +%F 2>/dev/null || date -d '7 days ago' +%F 2>/dev/null || echo "0000-00-00")
      # Persist the acknowledgement FIRST, and only nudge if it stuck. This hook
      # has no errexit, so a full disk or unwritable ack file would otherwise
      # leave no record and repeat the nudge every single session — which is the
      # noise that got the previous automation deleted.
      if [ -z "$last_nudge" ] || [ "$week_ago" \> "$last_nudge" ]; then
        if mkdir -p "$(dirname "$ack_file")" 2>/dev/null \
           && printf '%s|%s\n' "$review_after" "$today" > "$ack_file" 2>/dev/null; then
          printf '\n**Agent config is due a review.** `%s` is tuned for `%s` and its review_after date (%s) has passed. Offer the user a config sweep against current model guidance (plan: docs/plans/2026-07-28-opus5-agent-config-alignment.md); do not start one unprompted. Bump the marker when done.\n' \
            "${agents_file/#$HOME/~}" "${tuned_for:-unknown}" "$review_after"
        fi
      fi
    fi
  fi

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
