---
name: herdr-route
description: Send a message or hand work to another live agent session through herdr. Use when work belongs to another area or repo (homelab, tooling, apps…), when Jason asks to tell, ask or hand something to another session, or when an agent-team report must not be lost.
---

# Routing a message to another session

Only inside herdr: `test "${HERDR_ENV:-}" = 1`, or say you are not in herdr and stop. Run `herdr --skill` if you need the full CLI.

## Who gets it

Each Claude Code pane is named after the area it first worked in (`homelab`, `tooling`, `training`, `apps`, `knowledge`, `experiments`), or the repo name when no area file lists the repo. A second session in the same area is `homelab-2`. Names stay fixed for the life of the session. Other names (`agent-routing`, `reviewer`) were set by hand or by `herdr agent start`.

1. Find the area that owns the work: `grep -l "^- \`<repo>\`" ~/Code/.map/*.md`.
2. `herdr agent list` and pick the agent whose `name` is that area. `terminal_title_stripped` says what each session is doing now. Use it to choose between `homelab` and `homelab-2`, or to confirm the match.
3. If no name matches, or the choice is still unclear, ask Jason. Never guess, and never use the `cwd` field: every pane shows `~/Code`.

## Sending

```bash
herdr agent prompt <name> "From <your pane name or area> (<topic>): <message>. Reply to: herdr agent prompt <your name> \"...\""
```

- Name yourself as the sender, with the address to reply to. Find your own name with `herdr agent get "$HERDR_PANE_ID" | jq -r '.result.agent.name // empty'`; if it prints nothing, give `$HERDR_PANE_ID` as the reply address.
- The message must stand alone: the receiver has none of your context. Give paths, branch and PR numbers.
- Don't use `--wait` when sending to a working agent. Claude Code queues the prompt behind the current task, and a wait would block you.
- If the prompt fails with `agent_blocked`, the receiver is at an approval or question dialog. Never answer another agent's dialog, and never send keys to it. Tell Jason which session is blocked.
- A timeout does not prove the message was lost. Check `herdr agent read <name> --source recent-unwrapped --lines 60` before sending it again.

## Anything that must not be lost

A message in a pane can be lost to a crash, `/clear` or compaction. Messages between agent-team teammates have also gone missing. So for a report, handoff or result that must survive, also write it to a file, and put the path in the message:

- Teammates and helpers: write the report to the path the lead names, or else the lead's scratchpad, before sending. Then send only the absolute path and a one-line summary.
- Between sessions, or anything that must outlive a reboot: write `~/.local/state/agent-reports/<YYYY-MM-DD>-<from>-<topic>.md` and give its full path in the prompt. Scratchpads are cleared on reboot.
