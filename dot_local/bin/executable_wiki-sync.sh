#!/usr/bin/env bash
# Keeps the llm-wiki checkout (~/Work/Git/llm-wiki) fresh behind the `wiki`
# QMD MCP and the llm-wiki skill, run headless by launchd every 10 minutes.
# Each run:
#
#   1. publishes inbox entries a repository session left untracked, through
#      the wiki's own `scripts/wiki.py finish` (screened inbox files are the
#      one thing a repository session may push to main);
#   2. fast-forwards main from origin (--ff-only: it never merges, rebases,
#      resets or discards anything);
#   3. mirrors the shareable firstmate scout reports into a staging folder
#      that the wiki index carries as a second collection, `fm-reports`;
#   4. refreshes the QMD index (keyword index and embeddings) through the
#      wiki's own qmd_bootstrap.py, so `--check` stays green for sessions.
#
# It never guesses: a checkout with tracked edits, a Git operation in progress,
# local commits or a divergence is left exactly as it is. Most of those are a
# live wiki session mid-way through its own work, so they only alert once the
# checkout has gone unsynced for SYNC_STALE seconds (6 h), and then at most
# once an hour until a clean run clears it.
#
# Which reports get indexed is decided by a policy file that is NOT in this
# public repo, because report names alone can say what a report is about. One
# rule per line, matched against the report's directory name under data/:
#
#   allow <glob>     # index it (unless something below excludes it)
#   deny <glob>      # never index it; deny beats allow and visibility
#
# A report is indexed only when it has a frontmatter block, no `visibility:
# private`, no deny match, is not past its `stale_after`, and either matches
# an allow glob or says `visibility: shareable`. Everything else, including
# every report when the policy file is missing, stays out of the index.
#
# Commits are unsigned for the same reason as vault-autosync: the signing key
# lives in 1Password and nobody is at the screen.
#
# Overrides (the tests use them; launchd uses none): WIKI_SYNC_DIR,
# WIKI_SYNC_REPORTS_DIR, WIKI_SYNC_POLICY, WIKI_SYNC_STAGE_DIR,
# WIKI_SYNC_STATE_DIR, WIKI_SYNC_LOG, WIKI_SYNC_REACH_HOST (empty skips the
# reachability check), WIKI_SYNC_NOTIFY (a command given title and message),
# WIKI_SYNC_LOG_MAX_BYTES, WIKI_SYNC_SETTLE (seconds an inbox file must sit
# untouched before it is published), WIKI_SYNC_SKIP_QMD (1 skips step 4),
# WIKI_SYNC_TODAY (YYYY-MM-DD, for stale_after).
set -uo pipefail

# mise shims first, as in an interactive shell: QMD's native modules are built
# against the node the wiki sessions run, and a different major breaks them.
export PATH="$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

WIKI="${WIKI_SYNC_DIR:-$HOME/Work/Git/llm-wiki}"
REPORTS="${WIKI_SYNC_REPORTS_DIR:-$HOME/Work/Git/firstmate/data}"
POLICY="${WIKI_SYNC_POLICY:-$HOME/.config/wiki-sync/fm-reports.policy}"
STAGE="${WIKI_SYNC_STAGE_DIR:-$HOME/.local/share/wiki-sync/fm-reports}"
STATE_DIR="${WIKI_SYNC_STATE_DIR:-$HOME/.local/state/wiki-sync}"
LOG="${WIKI_SYNC_LOG:-$HOME/Library/Logs/wiki-sync.log}"
REACH_HOST="${WIKI_SYNC_REACH_HOST-github.com}"
LOG_MAX_BYTES="${WIKI_SYNC_LOG_MAX_BYTES:-1048576}"
SETTLE="${WIKI_SYNC_SETTLE:-1800}"
TODAY="${WIKI_SYNC_TODAY:-$(date +%F)}"
COLLECTION="fm-reports"
REMOTE=origin
BRANCH=main
ALERT_EVERY=3600
SYNC_STALE=21600

mkdir -p "$STATE_DIR" "$(dirname "$LOG")"

if [ -f "$LOG" ] && [ "$(wc -c <"$LOG" | tr -d ' ')" -gt "$LOG_MAX_BYTES" ]; then
  mv -f "$LOG" "$LOG.1"
fi
exec >>"$LOG" 2>&1

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }

notify() {
  if [ -n "${WIKI_SYNC_NOTIFY:-}" ]; then
    "$WIKI_SYNC_NOTIFY" "$1" "$2"
  else
    local msg=${2//\\/\\\\} title=${1//\\/\\\\}
    msg=${msg//\"/\\\"} title=${title//\"/\\\"}
    /usr/bin/osascript -e "display notification \"$msg\" with title \"$title\""
  fi
}

ALERT_FILE="$STATE_DIR/alert"
alert() {
  local msg="$1" now last=0
  now=$(date +%s)
  log "ALERT: $msg"
  [ -f "$ALERT_FILE" ] && last=$(head -n1 "$ALERT_FILE" 2>/dev/null || echo 0)
  case "$last" in '' | *[!0-9]*) last=0 ;; esac
  if [ $((now - last)) -ge "$ALERT_EVERY" ]; then
    notify "Wiki sync stopped" "$msg"
    printf '%s\n%s\n' "$now" "$msg" >"$ALERT_FILE"
  else
    log "(notification suppressed; last one $((now - last))s ago)"
  fi
}
clear_alert() {
  if [ -f "$ALERT_FILE" ]; then
    rm -f "$ALERT_FILE"
    log "previous problem resolved; syncing again"
    notify "Wiki sync" "Resolved — the wiki is syncing again."
  fi
}

# The epoch of the last run that left main equal to origin/main. A checkout
# that is merely busy logs; one that has stayed unsynced for SYNC_STALE alerts.
SYNCED_FILE="$STATE_DIR/last-synced"
SYNCED=0
mark_synced() { date +%s >"$SYNCED_FILE"; SYNCED=1; }
busy() {
  local msg="$1" now last
  now=$(date +%s)
  last=$(cat "$SYNCED_FILE" 2>/dev/null || echo 0)
  case "$last" in '' | *[!0-9]*) last=0 ;; esac
  if [ "$last" -eq 0 ]; then
    # No baseline yet (first run): start the clock now rather than alert.
    printf '%s\n' "$now" >"$SYNCED_FILE"
    last=$now
  fi
  if [ $((now - last)) -ge "$SYNC_STALE" ]; then
    alert "the wiki has not synced for $(((now - last) / 3600))h: $msg"
  else
    log "not syncing this run: $msg"
  fi
}

LOCK="$STATE_DIR/lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  pid=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    log "previous run (pid $pid) still going; skipping"
    exit 0
  fi
  log "reclaiming stale lock from pid ${pid:-unknown}"
  rm -rf "$LOCK"
  mkdir "$LOCK" 2>/dev/null || { log "lost the race for the lock; skipping"; exit 0; }
fi
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

export GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=60 GIT_TERMINAL_PROMPT=0
# Unsigned commits, for wiki.py's git calls as well as ours.
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false
g() { git -C "$WIKI" "$@"; }

problem=""

# ── 1 and 2: publish stranded inbox entries, then fast-forward ────────────────
sync_wiki() {
  local out gitdir marker current untracked f now mtime inbox=() other=0 young=0

  if ! out=$(g rev-parse --git-dir 2>&1); then
    alert "$WIKI is not readable as a git repo: $(tail -n1 <<<"$out")"
    return 1
  fi
  gitdir=$(g rev-parse --absolute-git-dir)

  for marker in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
    if [ -e "$gitdir/$marker" ]; then
      busy "a $marker is in progress in $WIKI."
      return 0
    fi
  done

  current=$(g symbolic-ref --quiet --short HEAD 2>/dev/null || echo "(detached)")
  if [ "$current" != "$BRANCH" ]; then
    busy "$WIKI is on $current, not $BRANCH."
    return 0
  fi

  if [ -n "$(g status --porcelain --untracked-files=no)" ]; then
    busy "$WIKI has uncommitted changes to tracked files."
    return 0
  fi

  if [ -n "$REACH_HOST" ] && ! /usr/sbin/scutil -r "$REACH_HOST" 2>/dev/null | grep -q '^Reachable'; then
    log "offline ($REACH_HOST unreachable); will sync next run"
    return 0
  fi

  if ! out=$(g fetch --quiet "$REMOTE" "refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH" 2>&1); then
    printf '%s\n' "$out"
    if grep -qiE 'could not resolve host|network is unreachable|timed out|connection refused|couldn.t connect|no route to host' <<<"$out"; then
      log "offline (fetch failed to connect); will retry next run"
      return 0
    fi
    alert "fetch failed: $(tail -n1 <<<"$out")"
    return 1
  fi

  # wiki.py finish needs a fully clean tree once it has committed, so publish
  # only when every untracked file is a settled top-level inbox entry. Anything
  # else untracked is someone's work in progress.
  now=$(date +%s)
  untracked=$(g ls-files --others --exclude-standard)
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      inbox/*/*) other=1 ;;
      inbox/*.md)
        mtime=$(stat -c %Y "$WIKI/$f" 2>/dev/null || stat -f %m "$WIKI/$f" 2>/dev/null || echo "$now")
        if [ $((now - mtime)) -ge "$SETTLE" ]; then inbox+=("$f"); else young=1; fi
        ;;
      *) other=1 ;;
    esac
  done <<<"$untracked"

  if [ "${#inbox[@]}" -gt 0 ] && [ "$other" -eq 0 ] && [ "$young" -eq 0 ]; then
    if [ "$(g rev-list --count "$REMOTE/$BRANCH..HEAD")" -gt 0 ]; then
      busy "$WIKI has local commits not on $REMOTE/$BRANCH, so the stranded inbox entries wait."
      return 0
    fi
    log "publishing ${#inbox[@]} stranded inbox entr$([ "${#inbox[@]}" -eq 1 ] && echo y || echo ies)"
    if ! out=$(cd "$WIKI" && python3 scripts/wiki.py finish \
      "inbox: publish ${#inbox[@]} stranded entr$([ "${#inbox[@]}" -eq 1 ] && echo y || echo ies) from $(hostname -s)" \
      "${inbox[@]}" 2>&1); then
      printf '%s\n' "$out"
      alert "publishing the stranded inbox entries failed: $(tail -n1 <<<"$out")"
      return 1
    fi
    # wiki.py prints its errors and still exits 0 on some paths; trust the tree.
    printf '%s\n' "$out"
    if [ -n "$(g status --porcelain)" ] || [ "$(g rev-parse HEAD)" != "$(g rev-parse "$REMOTE/$BRANCH")" ]; then
      alert "publishing the stranded inbox entries did not leave $WIKI clean and pushed: $(tail -n1 <<<"$out")"
      return 1
    fi
    log "published; now at $(g rev-parse --short HEAD)"
  elif [ "${#inbox[@]}" -gt 0 ]; then
    log "inbox entries wait: other untracked or still-settling files are present"
  fi

  if [ "$(g rev-list --count "$REMOTE/$BRANCH..HEAD")" -gt 0 ]; then
    busy "$WIKI has $(g rev-list --count "$REMOTE/$BRANCH..HEAD") local commit(s) not on $REMOTE/$BRANCH; \`python3 scripts/wiki.py push\` publishes them."
    return 0
  fi

  local before
  before=$(g rev-parse HEAD)
  if [ "$before" != "$(g rev-parse "$REMOTE/$BRANCH")" ]; then
    if ! out=$(g merge --ff-only --quiet "$REMOTE/$BRANCH" 2>&1); then
      printf '%s\n' "$out"
      busy "fast-forward to $REMOTE/$BRANCH failed: $(tail -n1 <<<"$out")"
      return 0
    fi
    log "fast-forwarded $(git -C "$WIKI" rev-parse --short "$before")..$(g rev-parse --short HEAD)"
  fi
  mark_synced
}

# ── 3: mirror the shareable scout reports ────────────────────────────────────
# Prints why a report is excluded, or nothing when it may be indexed.
report_verdict() {
  local slug="$1" file="$2" fm visibility stale glob allowed=0 rule
  if [ "$(head -n1 "$file")" != "---" ]; then
    echo "no frontmatter"
    return
  fi
  fm=$(awk 'NR == 1 { next } /^---[[:space:]]*$/ { exit } { print }' "$file")
  visibility=$(sed -n 's/^visibility:[[:space:]]*\([A-Za-z]*\).*/\1/p' <<<"$fm" | head -n1)
  stale=$(sed -n 's/^stale_after:[[:space:]]*"\{0,1\}\([0-9-]\{10\}\).*/\1/p' <<<"$fm" | head -n1)
  [ "$visibility" = private ] && { echo "visibility: private"; return; }
  # The glob is deliberately unquoted: it is a pattern.
  # shellcheck disable=SC2053
  while read -r rule glob; do
    case "$rule" in
      deny) [[ $slug == $glob ]] && { echo "denied by policy ($glob)"; return; } ;;
      allow) [[ $slug == $glob ]] && allowed=1 ;;
    esac
  done < <(sed -e 's/#.*//' "$POLICY" 2>/dev/null)
  if [ -n "$stale" ] && [[ $stale < $TODAY ]]; then
    echo "past stale_after $stale"
    return
  fi
  [ "$visibility" = shareable ] && allowed=1
  [ "$allowed" -eq 1 ] || echo "not allowed by policy"
}

STAGE_CHANGED=0
stage_reports() {
  local dir slug file why want=" " kept=0 f name
  mkdir -p "$STAGE"
  if [ ! -f "$POLICY" ]; then
    log "no report policy at $POLICY; indexing no reports"
  fi
  for dir in "$REPORTS"/*/; do
    slug=$(basename "$dir")
    file="$dir/report.md"
    [ -f "$file" ] && [ ! -L "$file" ] || continue
    why=$(report_verdict "$slug" "$file")
    [ -z "$why" ] || continue
    want+="$slug.md "
    kept=$((kept + 1))
    if ! cmp -s "$file" "$STAGE/$slug.md"; then
      cp "$file" "$STAGE/$slug.md.tmp" && mv -f "$STAGE/$slug.md.tmp" "$STAGE/$slug.md"
      STAGE_CHANGED=1
    fi
  done
  for f in "$STAGE"/*; do
    [ -e "$f" ] || continue
    name=$(basename "$f")
    if [[ $want != *" $name "* ]]; then
      rm -f "$f"
      log "dropped $name from $COLLECTION"
      STAGE_CHANGED=1
    fi
  done
  [ "$STAGE_CHANGED" -eq 1 ] && log "$COLLECTION now holds $kept report(s)"
  return 0
}

# ── 4: refresh the index ─────────────────────────────────────────────────────
qmd_ok() { grep -q '^QMD ready' <<<"$1" && ! grep -q 'QMD is not fully ready' <<<"$1"; }
q() { (cd "$WIKI" && python3 scripts/qmd_bootstrap.py --exec "$@") 2>&1; }

refresh_index() {
  local out path
  if [ ! -f "$WIKI/scripts/qmd_bootstrap.py" ]; then
    alert "$WIKI/scripts/qmd_bootstrap.py is missing; cannot refresh the index"
    return 1
  fi

  # Bootstrap first: it creates the wiki collection on a fresh checkout and
  # repairs whatever its readiness check finds stale, and is quick when ready.
  out=$(cd "$WIKI" && python3 scripts/qmd_bootstrap.py 2>&1)
  if ! qmd_ok "$out"; then
    printf '%s\n' "$out"
    alert "QMD refresh failed: $(grep -v '^Retry:' <<<"$out" | tail -n1)"
    return 1
  fi

  path=$(q collection show "$COLLECTION" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | head -n1)
  if [ "$path" != "$STAGE" ]; then
    if [ -n "$path" ]; then
      log "$COLLECTION points at $path; re-adding it at $STAGE"
      q collection remove "$COLLECTION" >/dev/null
    fi
    if ! out=$(q collection add "$STAGE" --name "$COLLECTION" --mask '*.md'); then
      printf '%s\n' "$out"
      alert "adding the $COLLECTION collection failed: $(tail -n1 <<<"$out")"
      return 1
    fi
    q context add "qmd://$COLLECTION" "Firstmate scout reports (local only, never pushed): dated research with sources. Verify a claim before filing it into the wiki." >/dev/null
    log "added the $COLLECTION collection"
    STAGE_CHANGED=1
  fi

  if [ "$STAGE_CHANGED" -eq 1 ]; then
    out=$(q update)
    if grep -qE '(^|[^0-9])[1-9][0-9]* skipped' <<<"$out"; then
      printf '%s\n' "$out"
      alert "qmd update skipped files; see $LOG"
      return 1
    fi
    out=$(q embed --timeout 25)
    # Bootstrap again so its readiness record covers the new index state.
    out=$(cd "$WIKI" && python3 scripts/qmd_bootstrap.py 2>&1)
    if ! qmd_ok "$out"; then
      printf '%s\n' "$out"
      alert "QMD refresh after the report update failed: $(grep -v '^Retry:' <<<"$out" | tail -n1)"
      return 1
    fi
    log "index refreshed with the report changes"
  fi
}

sync_wiki || problem=1
stage_reports || problem=1
if [ "${WIKI_SYNC_SKIP_QMD:-0}" != 1 ]; then
  refresh_index || problem=1
fi

[ -n "$problem" ] && exit 1
# A busy checkout is not a failure, but its alert clears only once a run has
# brought main back in step with origin (offline runs neither raise nor clear).
[ "$SYNCED" -eq 1 ] && clear_alert
exit 0
