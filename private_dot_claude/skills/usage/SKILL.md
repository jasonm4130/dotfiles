---
name: usage
description: Read how much of the Claude, Codex and Grok subscription allowances is used and when each resets. Use before handing work to another provider, before a long or parallel run, or when asked about usage, limits, quota or resets.
---

# Subscription usage across Claude, Codex and Grok

Run all three; none starts a model request. Each prints JSON with a `windows` list of `usedPercent` and `resetsAt` (UTC).

```bash
claude-usage --json < /dev/null
codex-usage --json < /dev/null
grok-usage --json < /dev/null
```

Report each provider as percent used, the window it covers, and the reset in local time. All three read undocumented interfaces that can change with any CLI release, so a script that exits non-zero is a finding to report with its message, not a reason to guess a number.

## Claude

`claude-usage` asks the endpoint behind Claude Code's own `/usage`, using the login Claude Code keeps in the Keychain. `window` is `weekly_all` for the whole plan and `weekly_scoped` for one model, named in `model`. A window the endpoint leaves out was not reported; do not report it as zero.

When `source` is `snapshot`, the login had expired or was refused and the numbers come from the last status-line update: say so, give `snapshotAgeMinutes`, and give `fallbackReason`. Never refresh the login from a script or by hand: a refresh rotates the token and can sign Claude Code out. Any normal Claude Code request renews it.

## Codex

`codex-usage` asks Codex's own app-server, which handles the login. `durationMinutes` 10080 is the weekly window. `limitResetsAvailable` counts free full resets of the limit: mention them when a window is above 80%. `creditBalance` is prepaid credit, separate from the plan's windows.

## Grok

`grok-usage` asks Grok's own agent for billing over its stdio protocol; it creates no session. If it reports that the Grok Build version no longer answers `_x.ai/billing`, or a login error, ask Jason to run `/usage` inside an interactive `grok` session and paste the result.

## Using the numbers

- A provider above 80% of a window with more than a day to its reset is short: move work that can wait to another provider.
- A provider under 50% with a reset inside a day has allowance that will expire unused: prefer it for delegated reviews and bounded tasks.
- Agent teams and parallel subagents spend the Claude weekly window several times faster than one session; check before starting them.
