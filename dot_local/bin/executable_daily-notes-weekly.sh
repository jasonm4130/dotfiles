#!/bin/zsh
# Weekly Obsidian daily-note backfill from local git history.
#
#   1. For each of the last 7 days, gather THIS user's authored commits across
#      every repo in ~/Work/Git (bots + the graphify fork-sync excluded), in
#      Brisbane-local time, bucketed by the day they landed.
#   2. Hand each day's commit bundle to `claude -p` (sonnet), which synthesises
#      the work into the daily note's Notes/Wins sections — narrative, not raw
#      commit subjects — preserving everything already there and skipping work
#      already recorded (so re-runs don't duplicate).
#   3. Days with zero commits get a factual "no commits" stub only if the note
#      is missing; existing notes are never overwritten by this job.
#   4. Fail loud: any day whose claude pass errors -> macOS notification + a
#      non-zero exit. The deterministic git work is done here in the shell; only
#      the prose + the merge is delegated to the model.
#
# Manual run:   ~/.local/bin/daily-notes-weekly.sh
# Dry run:      DAILY_NOTES_DRY_RUN=1 ~/.local/bin/daily-notes-weekly.sh   (no claude, no writes)
# Custom window: DAILY_NOTES_DAYS=14 ~/.local/bin/daily-notes-weekly.sh
#
# Invoked by ~/Library/LaunchAgents/dev.jasonmatthew.daily-notes-update.plist.

set -u

CLAUDE=/Users/jasonmatthew/.local/bin/claude
GIT_ROOT=~/Work/Git
VAULT=~/Documents/"Obsidian Vault"
DAILY_DIR="$VAULT/Daily"
TEMPLATE="$VAULT/_templates/Daily.md"
LOG=~/Library/Logs/daily-notes-weekly.log
WINDOW=${DAILY_NOTES_DAYS:-7}          # trailing N days, today inclusive
DRY=${DAILY_NOTES_DRY_RUN:-0}
EXCLUDE_REPOS=(graphify)               # fork-sync noise, not Jason's authored work
mkdir -p "$(dirname "$LOG")"

# LaunchAgent runs without an interactive shell; pull in PATH / any exports.
[ -r ~/.zshenv ] && source ~/.zshenv

log()    { print -r -- "$@" >> "$LOG"; }
notify() { osascript -e "display notification \"$2\" with title \"$1\"" 2>/dev/null; }

ordinal() {
  local n=$1
  case $n in
    11|12|13) print -r -- "${n}th" ;;
    *) case $(( n % 10 )) in
         1) print -r -- "${n}st" ;; 2) print -r -- "${n}nd" ;;
         3) print -r -- "${n}rd" ;; *) print -r -- "${n}th" ;;
       esac ;;
  esac
}

header_date() {  # YYYY-MM-DD -> "Wednesday 17th June 2026"
  local day=$1
  local wd=$(date -j -f "%Y-%m-%d %H:%M:%S" "$day 00:00:00" +"%A")
  local dn=$(date -j -f "%Y-%m-%d %H:%M:%S" "$day 00:00:00" +"%-d")
  local mo=$(date -j -f "%Y-%m-%d %H:%M:%S" "$day 00:00:00" +"%B")
  local yr=$(date -j -f "%Y-%m-%d %H:%M:%S" "$day 00:00:00" +"%Y")
  print -r -- "$wd $(ordinal "$dn") $mo $yr"
}

# Write a resolved daily-note skeleton (Templater syntax can't run headless).
# $2 is the single Notes-section bullet to seed (default placeholder "-").
ensure_note() {
  local day=$1 notes_seed=${2:--}
  local note="$DAILY_DIR/$day - Daily.md"
  [ -f "$note" ] && return 0
  cat > "$note" <<EOF
---
created: $day
type: atomic
tags: [daily]
related: [[Home]]
status: active
title: $day - Daily
---
# 📅 $(header_date "$day")

## 🎯 Focus for Today
- [ ]

## 🤝 Meetings
-

## ✅ Tasks (Due Today / Overdue)
\`\`\`tasks
not done
due before tomorrow
hide backlink
\`\`\`

## 📝 Notes
$notes_seed

## 🏆 Wins
<!-- Capture-worthy: anything you'd want to mention in an interview 6 months from now. Tags: [ship] [arch] [people] [external] [win]. Promoted to Brag Doc during weekly sweep. -->
-

## 🧠 Thoughts & Reflections
-

## ✅ Habits
- [ ] 🏃‍♂️ Running (80/20 Discipline)
- [ ] 🚴‍♂️ Cycling
- [ ] 🍎 DQS Compliance (No chips/soda)
- [ ] 💻 Code

## 📈 Performance Metrics
- **HRV**: ms (Goal: >55ms)
- **Sleep**: h (Goal: 8h 15m)
- **Weight**: kg (Target: 85kg)
- **Training Notes**:
EOF
  log "[$day] created note skeleton"
}

excluded() {  # is repo basename in EXCLUDE_REPOS?
  local name=$1 ex
  for ex in "${EXCLUDE_REPOS[@]}"; do [ "$name" = "$ex" ] && return 0; done
  return 1
}

# Per-day commit bundle (subject + indented body) across all repos -> stdout.
build_bundle() {
  local day=$1 repo name log
  print -r -- "# Commits for $day (Jason Matthew, Brisbane/AEST local time)"
  for repo in "$GIT_ROOT"/*/.git(N); do
    repo="${repo:h}"; name="${repo:t}"
    excluded "$name" && continue
    log=$(git -C "$repo" log --since="$day 00:00:00" --until="$day 23:59:59" \
      --all --no-merges --reverse --date=format-local:%H:%M \
      --author="Jason Matthew" --author="jasonm4130" \
      --format="- %ad [%h] %s%n%w(0,6,6)%b" 2>/dev/null)
    [ -n "$log" ] && printf '\n## [%s]\n%s\n' "$name" "$log"
  done
}

PROMPT_HEADER=$(cat <<'EOF'
You are appending the developer-work record to Jason's Obsidian daily note.

Read the target note, then merge the day's commits into TWO sections only:
"## 📝 Notes" and "## 🏆 Wins". Leave every other section (Focus, Meetings,
Tasks, Thoughts, Habits, Metrics) and any "## 🧪 Eval" section untouched.

RULES:
- Preserve every existing bullet in Notes and Wins VERBATIM. Only ADD.
- If a piece of work is already recorded (same repo + same gist), DO NOT add it
  again — this job re-runs, so be idempotent. If the Notes section is just a
  lone "-" placeholder, replace it with your entries.
- Keep Notes time-ordered. Each Notes entry: "- HH:MM [repo] <narrative>" —
  outcome-first, lead with the verb, **bold** the key metrics. Em-dashes are fine.
- Group a coherent chunk of work (many commits) into ONE entry; use the
  representative commit's HH:MM.
- Promote only genuinely shippable / architecturally-interesting work to Wins:
  "- [tag] [tag] [repo] <interview-worthy framing> [win]", tags from
  {ship, arch, people, external, win}.
- ACCURACY IS PARAMOUNT: ground every claim in the commit subjects/bodies below.
  Do NOT invent metrics or numbers that aren't present. Some commits may be
  duplicated (rebase artifact) — treat as one piece of work.
- Make the edits directly with Edit/Write. Output nothing else.
EOF
)

[ "$DRY" = "1" ] && log "===== DRY RUN (no claude, no writes) =====" || true
log "================================================="
log "daily-notes weekly — $(date)  (window: last $WINDOW days)"

PROCESSED=()
FAILED=()

i=0
while [ $i -lt "$WINDOW" ]; do
  day=$(date -j -v-${i}d +%Y-%m-%d)
  i=$(( i + 1 ))
  bundle=$(build_bundle "$day")
  note="$DAILY_DIR/$day - Daily.md"

  # No authored commits -> only seed a stub if the note doesn't exist yet.
  if ! print -r -- "$bundle" | grep -q '^## \['; then
    if [ -f "$note" ]; then
      log "[$day] no commits; note exists -> leave alone"
    elif [ "$DRY" = "1" ]; then
      log "[$day] no commits; DRY -> would create stub"
    else
      ensure_note "$day" "- No local commits across local repos today (note backfilled from git history for completeness)."
      log "[$day] no commits -> stub created"
    fi
    continue
  fi

  if [ "$DRY" = "1" ]; then
    log "[$day] DRY -> would synthesise $(print -r -- "$bundle" | grep -c '^## \[') repo group(s):"
    log "$bundle"
    continue
  fi

  ensure_note "$day"
  prompt="$PROMPT_HEADER

TARGET NOTE: $note
DAY: $(header_date "$day")

COMMITS:
$bundle"

  log "[$day] synthesising ..."
  out=$(cd "$DAILY_DIR" && print -r -- "$prompt" | "$CLAUDE" -p \
    --model sonnet --permission-mode acceptEdits \
    --allowedTools Read Edit Write --add-dir "$DAILY_DIR" 2>&1); rc=$?
  print -r -- "$out" >> "$LOG"
  if [ $rc -ne 0 ]; then
    FAILED+=("$day"); log "[$day] FAILED (rc=$rc)"
  else
    PROCESSED+=("$day"); log "[$day] ok"
  fi
done

log ""
log "summary: ${#PROCESSED[@]} synthesised | ${#FAILED[@]} failed"

if [ ${#FAILED[@]} -gt 0 ]; then
  notify "daily-notes weekly FAILED" "failed: ${FAILED[*]}"
  log "Done WITH FAILURES at $(date)"
  exit 1
fi
[ ${#PROCESSED[@]} -gt 0 ] && notify "daily-notes weekly" "updated: ${PROCESSED[*]}"
log "Done at $(date)"
