#!/usr/bin/env bash
# PreToolUse guard for unattended Codex sessions: the Firstmate worker profile's Bash and
# write guards (~/.claude-fm-workers/settings.json), run on Codex's payload, which has the
# same tool_input.command shape. It acts only when no person can answer an approval:
# Codex reports approval_policy=never (--dangerously-bypass-approvals-and-sandbox,
# no-mistakes agents, a Codex secondmate, --profile review) as permission_mode
# "bypassPermissions". Interactive sessions keep the native baseline (docs/codex-native.md).
# A payload without a readable permission_mode is guarded, so a renamed field fails closed.
# Firstmate crewmates launch with --disable hooks and get only rules/unattended.rules.
set -uo pipefail
payload=$(cat)
read -r mode tool < <(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    p = json.load(sys.stdin)
except Exception:
    p = {}
p = p if isinstance(p, dict) else {}
print(p.get("permission_mode") or "-", p.get("tool_name") or "-")' 2>/dev/null) || { mode=-; tool=-; }
case $mode in -|bypassPermissions) ;; *) exit 0 ;; esac

err=$(mktemp "${TMPDIR:-/tmp}/codex-guard.XXXXXX") || exit 2
trap 'rm -f "$err"' EXIT
# Run one guard on the payload. A Claude-style JSON deny or an exit 2 both block in Codex;
# the first block wins. A missing guard that must fail closed blocks too.
guard() {
  local required=$1; shift
  if [ ! -x "$1" ]; then
    [ "$required" = required ] || return 0
    echo "unattended-guard: $1 is missing, so this command cannot be checked; report it to firstmate." >&2
    exit 2
  fi
  local out rc
  out=$(printf '%s' "$payload" | "$@" 2>"$err"); rc=$?
  if [ "$rc" -eq 2 ]; then cat "$err" >&2; exit 2; fi
  case $out in *'"permissionDecision"'*'"deny"'*) printf '%s\n' "$out"; exit 0 ;; esac
}

case $tool in
  Bash)
    guard required "$HOME/.claude-fm-workers/hooks/homelab-guard.sh"
    guard required "$HOME/.local/bin/claude-hooks" secrets-scan
    guard optional "$HOME/.claude/hooks/disk-guard.sh" pretool
    guard optional "$HOME/.claude-fm-workers/hooks/docs-sync-plugins-only.sh"
    ;;
  apply_patch)
    guard required "$HOME/.local/bin/claude-hooks" secrets-scan
    ;;
esac
exit 0
