@~/.codex/AGENTS.md

# Claude Code only
- Reviewer names: "Sol" is GPT Sol via the `codex` CLI, never a Claude model or an Agent type; "Fable" is `Agent(model: "fable")`. "Sol and Fable" means one codex call plus one Agent call. How to pair reviewers lives in the codex-plan-review skill.
- Delegate volume, keep judgment: broad search goes to `Explore`, well-specified implementation to `worker`. Single-file edits, work coupled to this conversation, latency-sensitive steps and every judgment call stay in the main loop. Set `model` on every Agent dispatch, or it inherits the session model. Report a subagent's conclusion, never its transcript.
- One load-bearing fact gets one search; a "state of X" question gets a multi-worker research workflow with its workers on cheaper models.
- In code, use LSP (`goToDefinition`, `findReferences`, `hover`, `documentSymbol`) before grep for symbols; grep is for text.
