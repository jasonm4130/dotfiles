#!/bin/zsh
# Weekly graphify maintenance across all graphified repos.
#
#   1. Auto-upgrade graphifyy to the latest PyPI release (uv tool, --force).
#   2. Incremental `graphify update` per repo — AST-only, no API cost.
#   3. Self-heal: if an update degrades the graph (the shrink-guard trips, i.e.
#      the new graph would have fewer nodes — the symptom of a cache/format
#      change after an upgrade) or errors, recover with a full `graphify extract`
#      rebuild for THAT repo only (uses Kimi, costs API).
#   4. Fail loud: any repo still failing after recovery -> macOS notification and
#      a non-zero exit. No more silent exit-0 on a no-op (the original bug).
#
# Invoked by ~/Library/LaunchAgents/dev.jasonmatthew.graphify-update.plist.

set -u

UV=/opt/homebrew/bin/uv
GBIN=/Users/jasonmatthew/.local/share/uv/tools/graphifyy/bin/graphify
PYBIN=/Users/jasonmatthew/.local/share/uv/tools/graphifyy/bin/python
LOG=~/Library/Logs/graphify-weekly-update.log
mkdir -p "$(dirname "$LOG")"

# LaunchAgent runs without an interactive shell, so ~/.zshenv (which exports
# MOONSHOT_API_KEY for the Kimi backend) is not loaded automatically.
[ -r ~/.zshenv ] && source ~/.zshenv

# Bound per-request hangs: a stuck Kimi completion fails after 5 min and the
# built-in split-retry recovers, rather than blocking on the 600s default.
export GRAPHIFY_API_TIMEOUT=300

REPOS=(
  ~/Work/Git/continual-learning
  ~/Work/Git/form-abandonment
  ~/Work/Git/jasonmatthew.dev
  ~/Work/Git/session-retro
  ~/Work/Git/formrecap-lora-classifier
  ~/Work/Git/brok-stacks
  ~/Work/Git/email-management
  ~/Work/Git/Adaptive-Training
  ~/Work/Git/jasonm4130-cf
  ~/Work/Git/games-games-games
  ~/Work/Git/card-counting-trainer
  ~/Work/Git/brok-trading
  ~/Work/Git/transcoder
  ~/Work/Git/ss-webapp
)

log() { echo "$@" >> "$LOG"; }
notify() { osascript -e "display notification \"$2\" with title \"$1\"" 2>/dev/null; }
version() { "$PYBIN" -c "import importlib.metadata as m; print(m.version('graphifyy'))" 2>/dev/null || echo "unknown"; }
# A degraded update prints one of these and exits 0 — treat as needing a rebuild.
degraded() { grep -qiE "Refusing to overwrite|Nothing to update or rebuild failed|missing chunk files"; }

log "================================================="
log "graphify weekly — $(date)"

# 1. Auto-upgrade
OLD_VER=$(version)
log "[upgrade] graphifyy[kimi]@latest (was $OLD_VER) ..."
"$UV" tool install 'graphifyy[kimi]@latest' --force >> "$LOG" 2>&1
NEW_VER=$(version)
log "[upgrade] now $NEW_VER"

FAILED=()
REBUILT=()

for repo in "${REPOS[@]}"; do
  name=$(basename "$repo")
  if [ ! -d "$repo" ]; then
    log "[skip] $name — directory missing"
    continue
  fi
  log ""
  log "[$(date +%H:%M:%S)] $name — update"
  out=$(cd "$repo" && "$GBIN" update . 2>&1); rc=$?
  echo "$out" >> "$LOG"

  if [ $rc -ne 0 ] || print -r -- "$out" | degraded; then
    log "[$(date +%H:%M:%S)] $name — update degraded (rc=$rc); full rebuild via extract (Kimi)"
    # Small token-budget keeps each semantic request bounded so doc-heavy repos
    # don't pack into one giant chunk that times out (see continual-learning).
    out2=$(cd "$repo" && "$GBIN" extract . --backend kimi --token-budget 20000 --max-concurrency 3 2>&1); rc2=$?
    echo "$out2" >> "$LOG"
    if [ $rc2 -ne 0 ]; then
      FAILED+=("$name")
      log "[$(date +%H:%M:%S)] $name — REBUILD FAILED (rc=$rc2)"
    else
      REBUILT+=("$name")
      log "[$(date +%H:%M:%S)] $name — rebuilt ok"
    fi
  else
    log "[$(date +%H:%M:%S)] $name — ok"
  fi
done

log ""
log "summary: ${#REPOS[@]} repos | ${#REBUILT[@]} rebuilt | ${#FAILED[@]} failed | $OLD_VER -> $NEW_VER"

if [ ${#FAILED[@]} -gt 0 ]; then
  notify "graphify weekly FAILED" "failed: ${FAILED[*]}"
  log "Done WITH FAILURES at $(date)"
  exit 1
fi

[ ${#REBUILT[@]} -gt 0 ] && notify "graphify weekly: rebuilds done" "rebuilt: ${REBUILT[*]}"
log "Done at $(date)"
