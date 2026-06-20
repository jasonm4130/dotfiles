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
#                     --deep also trims the shared cargo cache + removes worktrees
#                     whose branch is on a remote (commits are preserved).
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
      printf '\n**⚠ Low disk: %sGB free** (warn threshold %sGB). Reclaim build artifacts before heavy builds:\n- `~/.claude/hooks/disk-guard.sh reclaim` (safe — deletes rebuildable target/ dirs in agent worktrees)\n- add `--deep` to also trim the shared cargo cache and remove pushed worktrees\n' "$free" "$WARN_GB"
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
      # 4. Remove agent worktrees whose branch is on a remote (commits survive
      #    in .git + on the remote; only the redundant working copy is dropped).
      for repo in "$GIT_ROOT"/*/; do
        git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || continue
        git -C "$repo" worktree list --porcelain 2>/dev/null \
          | awk '/^worktree /{w=$2} /^branch /{print w"\t"$2}' \
          | grep '/.claude/worktrees/' | while IFS=$'\t' read -r wt ref; do
              br=${ref#refs/heads/}
              if git -C "$repo" ls-remote --exit-code --heads origin "$br" >/dev/null 2>&1; then
                echo "  remove worktree (branch on remote): ${wt#$HOME/}"
                git -C "$repo" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
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
