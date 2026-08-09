#!/usr/bin/env bash
# SessionStart hook — emits a session primer as additionalContext.
# Only surfaces what Claude Code does NOT already inject natively: active plan
# files. Branch, status, recent commits, and MEMORY.md are covered by the
# native gitStatus snapshot and memory system — repeating them wastes context.
set -uo pipefail

PROJECT="${CLAUDE_PROJECT_DIR:-$PWD}"

# settings.json references ~/.claude/handoff-statusline.mjs unconditionally, but
# that file is written by the handoff plugin's setup.mjs and is NOT chezmoi-managed
# — a fresh machine gets the reference without the file. Chezmoi cannot own it: the
# plugin cache it is generated from does not exist until Claude Code has launched.
# This hook runs at exactly the moment the cache is guaranteed present.
#
# CLAUDE_HOME_OVERRIDE (setup.mjs's documented test seam) sends the settings.json
# patch to a throwaway dir, so only the version-agnostic wrapper is taken. Running
# setup.mjs directly would compare its absolute desiredCommand against our tracked
# tilde form, not match, and exit 1; --force would rewrite settings.json to an
# absolute path and leave permanent chezmoi drift.
if [ ! -f "$HOME/.claude/handoff-statusline.mjs" ]; then
  op_setup=$(ls -d "$HOME"/.claude/plugins/cache/jasonm4130-claude-skills/handoff/*/scripts/setup.mjs \
             2>/dev/null | sort -V | tail -1)
  if [ -n "$op_setup" ]; then
    op_tmp=$(mktemp -d)
    CLAUDE_HOME_OVERRIDE="$op_tmp" node "$op_setup" >/dev/null 2>&1 || true
    [ -f "$op_tmp/handoff-statusline.mjs" ] \
      && cp "$op_tmp/handoff-statusline.mjs" "$HOME/.claude/handoff-statusline.mjs"
    rm -rf "$op_tmp"
  fi
fi

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

  # A plan is a file with `# Task N` headings — the contract the SDD loop parses.
  # Classifying before asserting matters: this block used to `ls` a directory and
  # label whatever it found "Active plans", so a finished plan or a research doc
  # filed in a plans dir was injected as live work into every session of that repo.
  # Both halves of the claim are now checked — is it a plan, and is it still open.
  is_plan() { grep -qE '^#{1,3} +Task +[0-9A-Za-z]' "$1" 2>/dev/null; }
  is_closed() {
    grep -qiE '^[[:space:]]*(>[[:space:]]*)?(\*\*)?Status(\*\*)?[[:space:]]*:?[[:space:]]*(\*\*)?[[:space:]]*(SHIPPED|COMPLETE[D]?|DONE|ABANDONED|SUPERSEDED)' "$1" 2>/dev/null
  }

  # Only repo dirs are classified. ~/.claude/plans is Claude Code's own store,
  # written in its native plan format (no `# Task N`), so running the check there
  # would flag every file it owns — noisier than the bug this fixes.
  for spec in "$PROJECT/docs/plans:check" \
              "$PROJECT/docs/superpowers/plans:check" \
              "$PROJECT/.claude/plans:check" \
              "$HOME/.claude/plans:native"; do
    d="${spec%:*}"; mode="${spec##*:}"
    [ -d "$d" ] || continue
    rel="${d/#$HOME/~}"

    # Most-recent first. `ls -1t` omits dotfiles already; the -f test drops
    # subdirectories (archive/) without piping ls into grep.
    if [ "$mode" = native ]; then
      plans=""; plans_n=0
      while IFS= read -r f; do
        [ -n "$f" ] && [ -f "$d/$f" ] || continue
        plans="${plans}${plans:+$'\n'}$f"
        plans_n=$((plans_n + 1))
        [ "$plans_n" -ge 5 ] && break
      done < <(ls -1t "$d" 2>/dev/null)
      if [ -n "$plans" ]; then
        printf "\n**Active plans in \`%s\`:**\n" "$rel"
        printf "%s\n" "$plans" | sed 's/^/- /'
      fi
      continue
    fi

    active=""; active_n=0; misfiled=""; misfiled_n=0; scanned=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      p="$d/$f"
      # Skip subdirectories: is_plan greps them, fails, and they'd be reported
      # as "misfiled" — which they are not.
      [ -f "$p" ] || continue
      # Budget 25 FILES, not 25 entries. The ls|grep this replaced excluded
      # directories before its head -25; capping first instead would let a
      # dir-heavy plans/ exhaust the budget and hide every real plan below it.
      scanned=$((scanned + 1))
      [ "$scanned" -gt 25 ] && break
      if ! is_plan "$p"; then
        misfiled_n=$((misfiled_n + 1))
        [ "$misfiled_n" -le 6 ] && misfiled="${misfiled}${misfiled:+, }$f"
      elif ! is_closed "$p" && [ "$active_n" -lt 5 ]; then
        active_n=$((active_n + 1))
        active="${active}${active:+$'\n'}$f"
      fi
    done < <(ls -1t "$d" 2>/dev/null)

    if [ -n "$active" ]; then
      printf "\n**Active plans in \`%s\`:**\n" "$rel"
      printf "%s\n" "$active" | sed 's/^/- /'
    fi
    # Surfaced, never acted on. Moving a file is the user's call, and a misfiled
    # doc is a filing question ("is this research?"), not something to guess at.
    if [ -n "$misfiled" ]; then
      [ "$misfiled_n" -gt 6 ] && misfiled="${misfiled}, +$((misfiled_n - 6)) more"
      printf "\n**Not plans, filed in \`%s\`:** %s. No \`# Task N\` headings, so these are not implementation plans. Offer once to move them somewhere truthful (e.g. \`docs/research/\`) — do NOT move, rename, or delete anything unprompted, and drop it if the user passes.\n" \
        "$rel" "$misfiled"
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
4. `/goal <condition>` — the user asks for work bounded by an outcome rather than a step ("keep going until it converges", "get it green", "run until you're happy"). Offer it with a condition you have restated as a **command whose output must appear**, plus a turn bound — `/goal cargo nextest run --workspace exits 0 with output shown, or stop after 15 turns`. NOT for work that already has a definite end. An open-ended request left unrestated is the one that runs all night.
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
