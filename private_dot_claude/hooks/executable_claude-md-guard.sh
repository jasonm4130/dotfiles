#!/usr/bin/env bash
# claude-md-guard.sh — mechanical checks on always-loaded instruction files.
#
# Checks SHAPE, never QUALITY. "Would removing this line cause a mistake?" is
# judgement and stays human. This catches the regressions that are countable:
# size, banned narrative, silent truncation, and files that are never read.
#
# Thresholds and their provenance:
#   CLAUDE.md 200 lines   — Anthropic's explicit number, code.claude.com/docs/en/memory
#                           ("target under 200 lines... Longer files reduce adherence")
#                           It is SOFT: "CLAUDE.md files are loaded in full regardless
#                           of length." There is no enforced cap.
#   CLAUDE.md 12/24KB     — DERIVED bands, NOT Anthropic numbers, calibrated against
#                           the known-good working baseline (13.6KB global + 6.3KB
#                           tree file, both judged healthy). Bytes are the unit
#                           because Jason's prose runs 140-430 bytes/line, so 200
#                           lines means anywhere from 28KB to 86KB — the line count
#                           is not a usable gauge. Override with CMG_WARN_BYTES /
#                           CMG_MAX_BYTES.
#   NOT thresholds:       "40KB warning" is claudelint (third party; the string is
#                           absent from the installed 2.1.232 binary). "~300-line
#                           ceiling" appears on no Anthropic page. Do not cite either.
#   MEMORY.md 200 lines / 25600 bytes — HARD, mechanically enforced by Claude Code.
#                           Whichever hits first; content past it is silently
#                           dropped from session context. This is the only check
#                           here that catches a real bug rather than a smell.
#   dates in CLAUDE.md    — Jason's own rule: no provenance/incident narrative in
#                           CLAUDE.md unless the mechanism is what makes the rule
#                           stick. Flags for review; some are legitimate.
#
# Modes:
#   sweep              audit every CLAUDE.md/AGENTS.md/MEMORY.md under the roots
#   file <path>        check one file, human-readable
#   hook               PostToolUse(Edit|Write|MultiEdit|Bash): warn on the guarded
#                      files named in stdin. Never blocks.
#   drift              chezmoi source vs rendered copies
#
# Fail-open everywhere: a buggy guard must never break a session.
set -uo pipefail

MAX_LINES="${CMG_MAX_LINES:-200}"
WARN_BYTES="${CMG_WARN_BYTES:-12288}"   # 12KB — above this, review
MAX_BYTES="${CMG_MAX_BYTES:-24576}"     # 24KB — above this, act
MEM_MAX_LINES=200
MEM_MAX_BYTES=25600                     # HARD, enforced by Claude Code
MEM_WARN_BYTES=18432                    # 18KB — review
MEM_ACT_BYTES=22528                     # 22KB — act before the cap bites
LONG_LINE="${CMG_LONG_LINE:-400}"
ROOTS="${CMG_ROOTS:-$HOME/Work/Git}"
MODE="${1:-sweep}"

# Colour only for a terminal. Findings are also embedded in the hook's JSON
# output, where ANSI escapes would be noise (and check_file's output is captured
# via command substitution, so $1 alone decides nothing).
if [ -t 1 ]; then
  red() { printf '\033[31m%s\033[0m\n' "$1"; }
  yel() { printf '\033[33m%s\033[0m\n' "$1"; }
  grn() { printf '\033[32m%s\033[0m\n' "$1"; }
else
  red() { printf '%s\n' "$1"; }
  yel() { printf '%s\n' "$1"; }
  grn() { printf '%s\n' "$1"; }
fi

# check_file <path> — prints findings, returns count of hard failures
check_file() {
  local f="$1" fails=0 base b l ll dates imports
  [ -f "$f" ] || return 0
  base=$(basename "$f")
  b=$(wc -c < "$f" 2>/dev/null | tr -d ' ') || return 0
  l=$(wc -l < "$f" 2>/dev/null | tr -d ' ') || return 0

  if [ "$MODE" = "codex-hook" ]; then
    # Claude's MEMORY.md cap and @-import rules are not Codex guarantees.
    # Report local size heuristics only; instruction discovery is separate.
    if [ "$b" -gt "$MAX_BYTES" ]; then
      red "  review instruction size: ${b}B > ${MAX_BYTES}B local review threshold (not a measured context truncation)"
    elif [ "$b" -gt "$WARN_BYTES" ]; then
      yel "  review instruction size: ${b}B > ${WARN_BYTES}B local review threshold"
    fi
    return 0
  fi

  if [ "$base" = "MEMORY.md" ]; then
    # The only hard, enforced limit. Over it = silent context loss.
    if [ "$b" -gt "$MEM_MAX_BYTES" ] || [ "$l" -gt "$MEM_MAX_LINES" ]; then
      red "  TRUNCATED: ${b}B/${l}L exceeds ${MEM_MAX_BYTES}B/${MEM_MAX_LINES}L — content past the cap is NOT loaded"
      fails=$((fails + 1))
    elif [ "$b" -gt "$MEM_ACT_BYTES" ]; then
      red "  act: ${b}B is $((b * 100 / MEM_MAX_BYTES))% of the ${MEM_MAX_BYTES}B cap — trim before it truncates"
      fails=$((fails + 1))
    elif [ "$b" -gt "$MEM_WARN_BYTES" ]; then
      yel "  review: ${b}B is $((b * 100 / MEM_MAX_BYTES))% of the ${MEM_MAX_BYTES}B cap"
    fi
    # A store whose lines are long hits the byte cap well before line 200. Only
    # worth saying once the store is actually within reach of the cap — on a 1KB
    # index it is true but useless, and a guard that always prints gets ignored.
    if [ "$l" -gt 0 ] && [ "$b" -gt $((MEM_MAX_BYTES / 2)) ]; then
      avg=$((b / l))
      [ "$avg" -gt 150 ] && yel "  avg ${avg}B/line — byte cap bites at ~$((MEM_MAX_BYTES / avg)) lines, not ${MEM_MAX_LINES}"
    fi
    return $fails
  fi

  # CLAUDE.md / AGENTS.md
  if [ "$l" -gt "$MAX_LINES" ]; then
    red "  over line budget: ${l} lines > ${MAX_LINES} (Anthropic: soft guidance, reduces adherence)"
    fails=$((fails + 1))
  fi
  if [ "$b" -gt "$MAX_BYTES" ]; then
    red "  act: ${b}B > ${MAX_BYTES}B (~$((b / 4)) tokens, loaded every session)"
    fails=$((fails + 1))
  elif [ "$b" -gt "$WARN_BYTES" ]; then
    yel "  review: ${b}B is over the ${WARN_BYTES}B green band (~$((b / 4)) tokens)"
  fi

  ll=$(awk -v n="$LONG_LINE" 'length > n {c++} END {print c+0}' "$f" 2>/dev/null)
  [ "${ll:-0}" -gt 0 ] && yel "  ${ll} line(s) over ${LONG_LINE} chars — line count hides real size here"

  # Jason's rule: no dates/incident narrative unless the mechanism is load-bearing.
  # Exclude HTML-comment metadata lines (e.g. the config-review marker carrying
  # review_after=/last_checked= dates) — those are machine fields, not narrative.
  dates=$(grep -vE '^\s*<!--' "$f" 2>/dev/null \
    | grep -oE '\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\b' | sort -u | tr '\n' ' ')
  [ -n "$dates" ] && yel "  incident dates present (review — narrative belongs in memory): ${dates}"

  # @-imports do NOT reduce context; they load in full at launch.
  # NB: no `|| echo 0` here — grep -c already prints 0 and exits 1 on no match,
  # so the fallback would make the value "0\n0" and break the numeric test.
  imports=$(grep -cE '^\s*@[./~]' "$f" 2>/dev/null); imports=${imports:-0}
  [ "$imports" -gt 0 ] 2>/dev/null && yel "  ${imports} @-import(s) — these buy NO budget, they load in full at launch"

  return $fails
}

case "${1:-sweep}" in
  file)
    f="${2:?usage: claude-md-guard.sh file <path>}"
    b=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
    echo "${f/#$HOME/\~}  (${b}B)"
    out=$(check_file "$f" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; else grn "  ok"; fi
    ;;

  hook|codex-hook)
    # PostToolUse(Edit|Write|MultiEdit|Bash). Warn only — never block an edit.
    # Bash is covered because a heredoc, `sed -i` or `tee` rewrites an
    # always-loaded instruction file without the write tools being involved.
    # One guarded path per line; a token merely mentioned is enough (checking a
    # file that was only read is free, and parsing shell redirection is not).
    paths=$(python3 -c "
import json, os, sys
GUARDED = {'CLAUDE.md', 'AGENTS.md', 'CLAUDE.local.md', 'MEMORY.md'}
d = json.load(sys.stdin)
ti = d.get('tool_input', {}) or {}
one = ti.get('file_path') or ti.get('notebook_path')
if one:
    toks = [one]
else:
    toks = (ti.get('command') or '').split()
cwd = d.get('cwd') or os.getcwd()
home = os.path.expanduser('~')
for t in toks:
    t = t.strip('\\'\"')
    if not t or os.path.basename(t) not in GUARDED:
        continue
    if t.startswith('~/'):
        t = home + t[1:]
    elif t.startswith('\$HOME/'):
        t = home + t[5:]
    print(t if os.path.isabs(t) else os.path.join(cwd, t))
" 2>/dev/null) || exit 0

    all_out=""
    while IFS= read -r p; do
      [ -n "$p" ] && [ -f "$p" ] || continue
      out=$(check_file "$p" 2>/dev/null)
      [ -n "$out" ] || continue
      all_out="${all_out}$(printf 'claude-md-guard on %s:\n%s' "${p/#$HOME/\~}" "$out")
"
    done <<< "$paths"

    # Plain stdout from a PostToolUse hook is discarded by the harness —
    # findings only reach the model through hookSpecificOutput.
    [ -n "$all_out" ] && printf '%s' "$all_out" \
      | CMG_EVENT=PostToolUse python3 -c '
import json, os, sys
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": os.environ["CMG_EVENT"],
    "additionalContext": sys.stdin.read().strip(),
}}))
'
    exit 0
    ;;

  drift)
    # Do NOT diff source against rendered output: the renders are SUPPOSED to
    # differ (codex-only / claude-only fenced blocks), so a diff reports drift
    # that does not exist. chezmoi itself is the authority on whether the
    # rendered copies are stale — ask it, and only fall back to a diff if it
    # is unavailable.
    if command -v chezmoi >/dev/null 2>&1; then
      st=$(chezmoi status 2>/dev/null)
      if [ -z "$st" ]; then
        grn "chezmoi: clean — every rendered copy matches its source"
      else
        yel "chezmoi: apply pending, rendered copies are STALE:"
        printf '%s\n' "$st" | sed 's/^/    /'
        echo "    fix: chezmoi apply"
      fi
    else
      yel "chezmoi not on PATH — cannot verify render freshness (a raw diff would"
      yel "  false-positive on the intentional codex-only/claude-only fences)"
    fi
    ;;

  sweep)
    # No counters here: the reporting loop below is fed by a pipe, so it runs in
    # a subshell and any increment would be discarded at the closing `done`.
    # Always-loaded instruction files, plus every memory index.
    {
      printf '%s\n' "$HOME/.claude/CLAUDE.md" "$HOME/.ai/AGENTS.md" "$HOME/.codex/AGENTS.md"
      # shellcheck disable=SC2086
      find $ROOTS -maxdepth 3 \( -name CLAUDE.md -o -name AGENTS.md \) 2>/dev/null \
        | grep -v node_modules | grep -v '/worktrees/'
      find "$HOME/.claude/projects" -maxdepth 3 -name MEMORY.md 2>/dev/null
    } | sort -u | while read -r f; do
      [ -f "$f" ] || continue
      out=$(check_file "$f" 2>/dev/null)
      if [ -n "$out" ]; then
        b=$(wc -c < "$f" | tr -d ' ')
        printf '\n%s (%sB)\n%s\n' "${f/#$HOME/\~}" "$b" "$out"
      fi
    done
    echo
    echo "Files with no findings are omitted. Budgets: CLAUDE.md ${MAX_LINES}L/${MAX_BYTES}B (byte figure is a derived proxy, not an Anthropic number); MEMORY.md ${MEM_MAX_LINES}L/${MEM_MAX_BYTES}B (hard, enforced)."
    ;;

  *)
    echo "usage: claude-md-guard.sh {sweep|file <path>|hook|drift}" >&2
    exit 64
    ;;
esac
