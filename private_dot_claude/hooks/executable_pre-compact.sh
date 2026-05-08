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

python3 <<EOF
import json, os, sys, datetime
log_path = os.path.expanduser("~/.claude/compaction-log.jsonl")
entry = {
    "timestamp": "$ts",
    "project": "$PROJECT",
    "git_rev": "$git_rev",
    "trigger": "unknown",
}
hi = """$hook_input"""
try:
    if hi.strip():
        d = json.loads(hi)
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
            "write it to a durable file in this repo NOW (e.g. \`docs/plans/<topic>.md\` or "
            "\`notes/precompact-<short-summary>.md\`). After compaction, that file will be the "
            "only durable trace of pre-compact state."
        )
    }
}))
EOF
