---
name: usage
description: Read how much of the Claude, Codex and Grok subscription allowances is used and when each resets. Use before handing work to another provider, before a long or parallel run, or when asked about usage, limits, quota or resets.
---

# Subscription usage across Claude, Codex and Grok

None of these checks starts a model request. Report each provider as percent used, the window it covers, and the reset time in local time.

## Claude

Claude Code only exposes limits through the status line. `~/.local/bin/claude-statusline-tee` saves the latest status-line JSON that carried them:

```bash
python3 - <<'EOF'
import json, os, time
p = os.path.expanduser("~/.local/state/ships-log/claude-statusline.json")
age = (time.time() - os.path.getmtime(p)) / 60
for name, w in json.load(open(p)).get("rate_limits", {}).items():
    reset = time.strftime("%a %d %b %H:%M", time.localtime(w["resets_at"]))
    print(f"claude {name}: {w['used_percentage']}% used, resets {reset}")
print(f"snapshot is {age:.0f} min old")
EOF
```

The snapshot is only as fresh as the last assistant message in any session, so say how old it is. A window that is missing from `rate_limits` was not reported by Claude Code; do not report it as zero.

## Codex

```bash
codex-usage --json < /dev/null
```

Each entry in `windows` gives `usedPercent`, `durationMinutes` (10080 is the weekly window) and `resetsAt` in UTC. Convert `resetsAt` to local time.

## Grok

`grok usage` cannot print plan usage outside a session (checked on Grok Build 1.0.77), and `grok -p "/usage"` treats it as a prompt. Ask Jason to run `/usage` inside an interactive `grok` session and paste the result. Re-check `grok usage < /dev/null` after a Grok Build update before repeating this.

## Using the numbers

- A provider above 80% of a window with more than a day to its reset is short: move work that can wait to another provider.
- A provider under 50% with a reset inside a day has allowance that will expire unused: prefer it for delegated reviews and bounded tasks.
- Agent teams and parallel subagents spend the Claude weekly window several times faster than one session; check before starting them.
