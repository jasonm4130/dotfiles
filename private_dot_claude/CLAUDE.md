@~/.codex/AGENTS.md

# Claude Code only
- Set `model` on every subagent and teammate: Haiku for search and reading, Sonnet for well-specified implementation, Opus for work that needs judgment, Fable for hard design or a final review.
- Other providers review through their own harnesses: Codex with `/codex:review` or `/codex:adversarial-review`, Grok with `/grok-build:review` or `/grok-build:critique`. Treat their findings as comments to verify, not as edits to apply.
