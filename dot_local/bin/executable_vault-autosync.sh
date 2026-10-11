#!/usr/bin/env bash
# Keeps the Obsidian vault (~/Documents/Main, a clone of the private
# jasonm4130/Obsidian-Main-Vault) in step with origin, run headless by launchd
# every 10 minutes whether or not Obsidian is open. Each run commits whatever
# is uncommitted (the vault's .gitignore decides what that is), rebases onto
# origin/main to pick up the life-admin second mate's merged changes, and
# pushes.
#
# It never guesses: a rebase conflict is aborted, which puts the vault back
# exactly as it was before the pull, nothing is pushed, and a notification
# repeats (at most once an hour) until the conflict is settled by hand. It
# never force-pushes, resets or discards anything.
#
# Commits are unsigned (--no-gpg-sign): the global signing key lives in
# 1Password and would prompt or fail with nobody at the screen. The network
# leg goes over HTTPS through the gh credential helper for the same reason,
# instead of the 1Password SSH agent the remote URL names.
#
# Overrides (the tests use them; launchd uses none): VAULT_SYNC_DIR,
# VAULT_SYNC_STATE_DIR, VAULT_SYNC_LOG, VAULT_SYNC_REACH_HOST (empty skips the
# reachability check), VAULT_SYNC_NOTIFY (a command given title and message),
# VAULT_SYNC_LOG_MAX_BYTES.
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

VAULT="${VAULT_SYNC_DIR:-$HOME/Documents/Main}"
STATE_DIR="${VAULT_SYNC_STATE_DIR:-$HOME/.local/state/vault-autosync}"
LOG="${VAULT_SYNC_LOG:-$HOME/Library/Logs/vault-autosync.log}"
REACH_HOST="${VAULT_SYNC_REACH_HOST-github.com}"
LOG_MAX_BYTES="${VAULT_SYNC_LOG_MAX_BYTES:-1048576}"
REMOTE=origin
BRANCH=main
ALERT_EVERY=3600

mkdir -p "$STATE_DIR" "$(dirname "$LOG")"

# Bounded log: one previous generation, rotated before this run writes.
if [ -f "$LOG" ] && [ "$(wc -c <"$LOG" | tr -d ' ')" -gt "$LOG_MAX_BYTES" ]; then
  mv -f "$LOG" "$LOG.1"
fi
exec >>"$LOG" 2>&1

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }

notify() {
  if [ -n "${VAULT_SYNC_NOTIFY:-}" ]; then
    "$VAULT_SYNC_NOTIFY" "$1" "$2"
  else
    local msg=${2//\\/\\\\} title=${1//\\/\\\\}
    msg=${msg//\"/\\\"} title=${title//\"/\\\"}
    /usr/bin/osascript -e "display notification \"$msg\" with title \"$title\""
  fi
}

# Alert state lives in a file, so a problem left unresolved keeps alerting on
# later runs, but at most once an hour; a clean run clears it.
ALERT_FILE="$STATE_DIR/alert"
alert() {
  local msg="$1" now last=0
  now=$(date +%s)
  log "ALERT: $msg"
  [ -f "$ALERT_FILE" ] && last=$(head -n1 "$ALERT_FILE" 2>/dev/null || echo 0)
  case "$last" in '' | *[!0-9]*) last=0 ;; esac
  if [ $((now - last)) -ge "$ALERT_EVERY" ]; then
    notify "Vault sync stopped" "$msg"
    printf '%s\n%s\n' "$now" "$msg" >"$ALERT_FILE"
  else
    log "(notification suppressed; last one $((now - last))s ago)"
  fi
}
clear_alert() {
  if [ -f "$ALERT_FILE" ]; then
    rm -f "$ALERT_FILE"
    log "previous problem resolved; syncing again"
    notify "Vault sync" "Resolved — the vault is syncing again."
  fi
}

# One run at a time: mkdir is atomic. A lock left by a dead run is reclaimed.
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

# A stalled transfer must not hold the lock forever.
export GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=60 GIT_TERMINAL_PROMPT=0
g() { git -C "$VAULT" -c url.https://github.com/.insteadOf=git@github.com: "$@"; }

if ! out=$(g rev-parse --git-dir 2>&1); then
  alert "$VAULT is not readable as a git repo: $(tail -n1 <<<"$out")"
  exit 1
fi
gitdir=$(g rev-parse --absolute-git-dir)

# Someone (him, mid-way through settling a conflict) is already operating on
# the repo; staging or rebasing under them would make things worse.
for marker in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
  if [ -e "$gitdir/$marker" ]; then
    alert "the vault has a $marker in progress; finish or abort it in $VAULT and sync resumes."
    exit 1
  fi
done

current=$(g symbolic-ref --quiet --short HEAD 2>/dev/null || echo "(detached)")
if [ "$current" != "$BRANCH" ]; then
  alert "the vault is on $current, not $BRANCH; check out $BRANCH and sync resumes."
  exit 1
fi

if [ -n "$(g status --porcelain)" ]; then
  g add -A
  n=$(g diff --cached --name-only | wc -l | tr -d ' ')
  msg="vault autosync: $n file(s) from $(hostname -s) at $(date '+%Y-%m-%d %H:%M')"
  if ! out=$(g commit --no-gpg-sign --quiet -m "$msg" 2>&1); then
    printf '%s\n' "$out"
    alert "committing local edits failed (left staged, nothing pushed): $(tail -n1 <<<"$out")"
    exit 1
  fi
  log "committed $n file(s) as $(g rev-parse --short HEAD)"
fi

if [ -n "$REACH_HOST" ] && ! /usr/sbin/scutil -r "$REACH_HOST" 2>/dev/null | grep -q '^Reachable'; then
  log "offline ($REACH_HOST unreachable); will pull and push next run"
  exit 0
fi

before=$(g rev-parse HEAD)
if ! out=$(g pull --rebase --no-autostash --quiet "$REMOTE" "$BRANCH" 2>&1); then
  printf '%s\n' "$out"
  if [ -e "$gitdir/rebase-merge" ] || [ -e "$gitdir/rebase-apply" ]; then
    g rebase --abort
    after=$(g rev-parse HEAD)
    if [ "$after" != "$before" ]; then
      alert "rebase conflict, and the abort left HEAD at $after instead of $before. Check $VAULT by hand."
      exit 1
    fi
    files=$(sed -n 's/^CONFLICT ([^)]*): .* in //p' <<<"$out" | head -n3 | paste -sd, -)
    alert "conflict with $REMOTE/$BRANCH${files:+ in $files}. Nothing pushed; vault left as it was. Rebase onto $REMOTE/$BRANCH by hand."
    exit 1
  fi
  if grep -qiE 'could not resolve host|network is unreachable|timed out|connection refused|couldn.t connect|no route to host' <<<"$out"; then
    log "offline (pull failed to connect); will retry next run"
    exit 0
  fi
  alert "pull failed: $(tail -n1 <<<"$out")"
  exit 1
fi
[ "$(g rev-parse HEAD)" != "$before" ] && log "pulled $REMOTE/$BRANCH; now at $(g rev-parse --short HEAD)"

ahead=$(g rev-list --count "$REMOTE/$BRANCH..HEAD")
if [ "$ahead" -gt 0 ]; then
  if ! out=$(g push --quiet "$REMOTE" "HEAD:$BRANCH" 2>&1); then
    printf '%s\n' "$out"
    if grep -qiE 'rejected|fetch first|non-fast-forward' <<<"$out"; then
      log "push raced a newer $REMOTE/$BRANCH; will rebase and retry next run"
      exit 0
    fi
    alert "push failed: $(tail -n1 <<<"$out")"
    exit 1
  fi
  log "pushed $ahead commit(s) to $REMOTE/$BRANCH"
fi

clear_alert
exit 0
