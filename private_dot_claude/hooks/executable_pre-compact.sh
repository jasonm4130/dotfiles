#!/usr/bin/env bash
# PreCompact hook — log compaction event + nudge Claude to checkpoint state.
set -uo pipefail

PROJECT="${CLAUDE_PROJECT_DIR:-$PWD}"
LOG="$HOME/.claude/compaction-log.jsonl"

mkdir -p "$(dirname "$LOG")"

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
git_rev=""
if (cd "$PROJECT" && git rev-parse --is-inside-work-tree >/dev/null 2>&1); then
  git_rev=$(timeout 2 git -C "$PROJECT" rev-parse --short HEAD 2>/dev/null || echo "")
fi

# Read stdin (hook input JSON) so we can capture the matcher (auto vs manual)
hook_input=""
if [ ! -t 0 ]; then
  hook_input=$(timeout 1 cat || true)
fi

# The hook payload is passed on stdin and read with json.load — never
# interpolated into the Python source. Interpolating it corrupted every payload
# containing escapes or newlines (logging trigger "unknown") and raised
# SyntaxError on unbalanced quotes.
printf '%s' "$hook_input" | CMP_TS="$ts" CMP_PROJECT="$PROJECT" CMP_GIT_REV="$git_rev" python3 -c '
import json, os, sys
log_path = os.path.expanduser("~/.claude/compaction-log.jsonl")
entry = {
    "timestamp": os.environ.get("CMP_TS", ""),
    "project": os.environ.get("CMP_PROJECT", ""),
    "git_rev": os.environ.get("CMP_GIT_REV", ""),
    "trigger": "unknown",
}
try:
    d = json.load(sys.stdin)
    entry["trigger"] = d.get("matcher") or d.get("trigger") or "unknown"
    entry["session_id"] = d.get("session_id", "")
except Exception:
    pass

with open(log_path, "a") as f:
    f.write(json.dumps(entry) + "\n")

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreCompact",
        "additionalContext": (
            "⚠️ Compaction is about to summarize this conversation. "
            "If there is reasoning, plans, or in-flight context worth keeping past the summary, "
            "write it to a durable file in this repo NOW (e.g. `docs/plans/<topic>.md` or "
            "`notes/precompact-<short-summary>.md`). After compaction, that file will be the "
            "only durable trace of pre-compact state."
        )
    }
}))
'
