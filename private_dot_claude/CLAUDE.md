@~/.codex/AGENTS.md

# Claude Code only
- Reviewer names: "Sol" is GPT Sol via the `codex` CLI, never a Claude model or an Agent type; "Fable" is `Agent(model: "fable")`. "Sol and Fable" means one codex call plus one Agent call. How to pair reviewers lives in the codex-plan-review skill.
- Delegate volume, keep judgment: broad search goes to `Explore`, well-specified implementation to `worker` (Sonnet), a "state of X" question to the `deep-research` skill; one load-bearing fact gets one search. Single-file edits, work coupled to this conversation, latency-sensitive steps, design judgment and long unsupervised runs stay on the session model. Set `model` on every Agent dispatch; unset agents and workflow agents inherit the session model. Report a subagent's conclusion, never its transcript.
- In code, use LSP (`goToDefinition`, `findReferences`, `hover`, `documentSymbol`) before grep for symbols; grep is for text.
