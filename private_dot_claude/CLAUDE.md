@~/.codex/AGENTS.md

# Claude Code only
- Set `model` on every subagent and teammate: Haiku for search and reading, Sonnet for well-specified implementation, Opus for work that needs judgment, a fresh Fable subagent with a short brief for a final review.
- Consult the advisor (Fable) only before committing to a hard design choice or when confidence is low, not for routine steps.
- Hand work to the other providers when it suits them: a bounded, well-specified task or a stuck investigation goes to Codex with `/codex:rescue` or to Grok with `/grok-build:delegate`, and an independent second opinion goes to their review commands. Check the `usage` skill first when a run is large, and verify what comes back before building on it.
- Other providers review through their own harnesses: Codex with `/codex:review` or `/codex:adversarial-review`, Grok with `/grok-build:review` or `/grok-build:critique`. Treat their findings as comments to verify, not as edits to apply.
- Web search: prefer the Parallel MCP server (`mcp__parallel__*`) over the built-in WebSearch; fall back to WebSearch only if Parallel is down or returns nothing useful.
- When a flow needs commands the auto-mode classifier gates (chezmoi apply, installs, service restarts), name those exact commands in the up-front plan question rather than adding allow rules; naming them lets the classifier decide better.
- A detached job started from a Bash tool call dies with the call on macOS (no setsid): start anything that must outlive it with `start_new_session=True`.
