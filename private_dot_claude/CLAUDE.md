@~/.codex/AGENTS.md

# Claude Code only
- Set `model` on every subagent and teammate: Haiku for search and reading, Sonnet for well-specified implementation, Opus for work that needs judgment, Fable for hard design or a final review.
- Hand work to the other providers when it suits them: a bounded, well-specified task or a stuck investigation goes to Codex with `/codex:rescue` or to Grok with `/grok-build:delegate`, and an independent second opinion goes to their review commands. Check the `usage` skill first when a run is large, and verify what comes back before building on it.
- Other providers review through their own harnesses: Codex with `/codex:review` or `/codex:adversarial-review`, Grok with `/grok-build:review` or `/grok-build:critique`. Treat their findings as comments to verify, not as edits to apply.
