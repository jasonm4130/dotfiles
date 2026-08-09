#!/usr/bin/env bash
# disk-guard.sh — keep heavy multi-agent Rust builds from silently filling the
# disk and wedging the session (the harness can't even write a tool-output file
# once the volume hits 100%).
#
# Root cause it guards against: every agent worktree under <repo>/.claude/
# worktrees/* gets its own CARGO_TARGET_DIR (the documented anti-cross-
# contamination convention), so a long multi-agent session accumulates dozens
# of multi-GB target/ dirs that are never cleaned up. Observed 105 GB once.
#
# Modes:
#   free-gb            print integer GB free on the volume holding $HOME
#   check             SessionStart: emit a warning line if free < WARN_GB
#   pretool           PreToolUse(Bash): block heavy cargo builds if free < BLOCK_GB
#   reclaim [--deep]  delete rebuildable target/ dirs in agent worktrees + prune.
#                     --deep also trims the shared cargo cache + removes agent
#                     worktrees that are provably redundant: unlocked, clean,
#                     and local tip == remote tip. Never dirty/ahead/locked ones.
#
# Fail-open everywhere: any error → behave as if disk is fine. A buggy guard
# must never block a build on a healthy disk.
set -uo pipefail

WARN_GB="${DISK_GUARD_WARN_GB:-25}"
BLOCK_GB="${DISK_GUARD_BLOCK_GB:-8}"
GIT_ROOT="${DISK_GUARD_GIT_ROOT:-$HOME/Work/Git}"

free_gb() {
  # Available 1K-blocks (BSD/macOS df col 4) → GB. On any failure print a big
  # number so callers fail open (never warn, never block).
  df -k "$HOME" 2>/dev/null | tail -1 | awk '{ printf "%d", $4/1024/1024 }' 2>/dev/null || echo 999999
}

case "${1:-check}" in
  free-gb)
    free_gb
    ;;

  check)
    free=$(free_gb)
    if [ "$free" -lt "$WARN_GB" ] 2>/dev/null; then
      printf '\n**⚠ Low disk: %sGB free** (warn threshold %sGB). Reclaim build artifacts before heavy builds:\n- `~/.claude/hooks/disk-guard.sh reclaim` (safe — deletes rebuildable target/ dirs in agent worktrees)\n- add `--deep` to also trim the shared cargo cache and remove fully-pushed clean worktrees\n' "$free" "$WARN_GB"
    fi
    ;;

  pretool)
    # Fast path: disk healthy → allow everything without even parsing stdin.
    free=$(free_gb)
    [ "$free" -ge "$BLOCK_GB" ] 2>/dev/null && exit 0
    # Disk critically low: only block the heavy builds that would fill it.
    cmd=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',d).get('command',''))" 2>/dev/null || echo "")
    case "$cmd" in
      *"cargo build"*|*"cargo test"*|*"cargo clippy"*|*"cargo component"*|*"cargo xtask"*|*"cargo run"*|*"cargo doc"*|*"cargo bench"*)
        echo "BLOCKED by disk-guard: only ${free}GB free (< ${BLOCK_GB}GB). A workspace build will likely fail and wedge the session. Run: ~/.claude/hooks/disk-guard.sh reclaim --deep" >&2
        exit 2
        ;;
    esac
    exit 0
    ;;

  reclaim)
    deep=0
    [ "${2:-}" = "--deep" ] && deep=1
    before=$(free_gb)
    echo "disk-guard reclaim: ${before}GB free before"

    # 1. Rebuildable target/ dirs inside every repo's agent worktrees — the
    #    dominant disk driver, zero code risk (pure build output).
    shopt -s nullglob
    for t in "$GIT_ROOT"/*/.claude/worktrees/*/target; do
      echo "  rm target: ${t#$HOME/}"
      rm -rf "$t"
    done

    # 2. Prune dangling worktree registrations for every repo.
    for repo in "$GIT_ROOT"/*/; do
      if git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
        git -C "$repo" worktree prune 2>/dev/null || true
      fi
    done

    if [ "$deep" -eq 1 ]; then
      # 3. Shared cargo target cache (rebuildable).
      for c in "$HOME/.cache/cargo/target" "$HOME/.cargo/target"; do
        [ -d "$c" ] && { echo "  rm cargo cache: ${c#$HOME/}"; rm -rf "${c:?}"/* 2>/dev/null || true; }
      done
      # 4. Remove agent worktrees ONLY when provably redundant: not locked,
      #    checkout clean, and the local branch tip EQUALS the remote tip.
      #    2026-07-29: the old "branch exists on remote" test deleted a LIVE
      #    session worktree that was 11 commits ahead of origin — the refs
      #    survived, but uncommitted agent work and generated files did not,
      #    and a running SDD workflow lost its working directory. A branch
      #    being on the remote says nothing about the checkout being
      #    disposable. Fail closed on every uncertainty.
      for repo in "$GIT_ROOT"/*/; do
        git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || continue
        # Fields are separated by US (\037), NOT tab. Tab is an IFS *whitespace*
        # character, so `IFS=$'\t' read` collapses a run of tabs into one
        # delimiter — a detached worktree emits an empty ref, and every later
        # field shifts left (ref picks up the locked flag, locked becomes
        # empty). That mislabelled every detached worktree as "no local ref"
        # and silently disabled the locked check for it. \037 is not IFS
        # whitespace, so empty fields survive.
        git -C "$repo" worktree list --porcelain 2>/dev/null \
          | awk '
              /^worktree /{wt=$2; ref=""; locked=0}
              /^branch /{ref=$2}
              /^locked/{locked=1}
              /^$/{if (wt != "") print wt "\037" ref "\037" locked; wt=""}
              END{if (wt != "") print wt "\037" ref "\037" locked}
            ' \
          | grep '/.claude/worktrees/' | while IFS=$'\037' read -r wt ref locked; do
              br=${ref#refs/heads/}
              [ "$locked" = "1" ] && { echo "  keep (locked): ${wt#$HOME/}"; continue; }
              [ -z "$br" ] && { echo "  keep (detached): ${wt#$HOME/}"; continue; }
              if ! st=$(git -C "$wt" status --porcelain 2>/dev/null); then
                echo "  keep (status unreadable): ${wt#$HOME/}"; continue
              fi
              [ -n "$st" ] && { echo "  keep (dirty): ${wt#$HOME/}"; continue; }
              local_sha=$(git -C "$repo" rev-parse --verify "refs/heads/$br" 2>/dev/null) \
                || { echo "  keep (no local ref): ${wt#$HOME/}"; continue; }
              remote_sha=$(git -C "$repo" ls-remote --heads origin "$br" 2>/dev/null | awk '{print $1}')
              if [ -n "$remote_sha" ] && [ "$remote_sha" = "$local_sha" ]; then
                echo "  remove worktree (fully pushed, clean): ${wt#$HOME/}"
                git -C "$repo" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
              else
                echo "  keep (unpushed or no remote): ${wt#$HOME/}"
              fi
            done
        git -C "$repo" worktree prune 2>/dev/null || true
      done
    fi

    after=$(free_gb)
    echo "disk-guard reclaim: ${after}GB free after (was ${before}GB)"
    ;;

  *)
    echo "usage: disk-guard.sh {free-gb|check|pretool|reclaim [--deep]}" >&2
    exit 64
    ;;
esac
