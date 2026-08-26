# Code Work (`~/Work/Git/**`)

Guidance that applies when working in any of Jason's code repos. Loaded lazily by Claude Code when a session works in this tree.

## LSP-First Code Navigation

In code files (TS, JS, Python, Rust, Go, …), reach for LSP before grep: `goToDefinition` and `findReferences` instead of grepping for a symbol, `hover` instead of reading a whole file for a type, `documentSymbol` instead of reading it for structure. Grep is for text — TODOs, string literals, log messages, config values — and for when LSP returns empty or is unavailable.

The `lsp-first-guard.js` PreToolUse hook catches the Grep case only; nothing catches "read the whole file instead of `hover`", so the preference above is the part that has to be remembered.

## Delegate with an explicit model tier

When dispatching the Agent tool, always set `model` explicitly — subagents otherwise inherit the session model, which on an Opus/Fable session runs searches and mechanical work at the most expensive tier (measured: 73% of dispatches leaked this way before this rule existed). The `workflow-model-guard` plugin's Agent hook denies untiered dispatches and names the tiers in its deny reason.

Don't delegate at all when the task is trivial, tightly coupled to conversation context, or latency-sensitive — a fresh subagent pays a cold-start and relay-loss cost that outweighs the context saving (Anthropic's own docs warn the same).

## Escalate to Fable on a trigger, not on a feeling

"This needs more reasoning" is a label applied after difficulty is already visible, which makes every rescue look like foresight and every wasted escalation look like judgment. Escalate when one of these fires, and say which one:

1. Two failed attempts at the same acceptance test or reproduction.
2. Competing architectural approaches where the choice is irreversible.
3. Security, data-loss, or production-migration risk in the change itself.
4. Evidence spanning several repos, or a system nobody in the session knows.
5. Adversarial review *after* an implementation is complete.

**Route Fable to planning and review, not to taking over implementation** — trigger 5 is the highest-value one, and if you conflate "Fable implemented it" with "a second pass caught it" you credit the model for what the second look did. Escalation means a new session or subagent at the higher tier, not raising effort in place — changing effort mid-conversation invalidates the prompt cache, so pick a level at the start of a session and hold it.

**Effort on the `Agent` tool comes from the agent definition, not the call.** `Workflow`'s `agent()` takes `opts.effort`; the plain `Agent` tool has no per-call effort param, but agent frontmatter now supports `effort:` (low–max, overrides session effort for that agent) — so pin model + effort in `~/.claude/agents/*.md` for recurring worker roles, and use per-dispatch `model` alone for one-offs. Prefer holding the model and lowering effort — Anthropic documents `low` as the fit for subagents working from a settled spec.

## Cross-provider review: run codex-review without being asked

The `codex-plan-review` skill's own description carries the gates and when to fire them; invoke it automatically rather than waiting to be prompted. What the skill does not say:

- **Whole-branch, not per-task.** One diff pass on `main...HEAD`, never a Codex call inside each SDD task — per-task pays N× the paid-call cost and N× the reviewer's over-rejection surface to catch strictly less.
- **Terra for automatic passes; escalate to Sol only when Jason asks for Sol by name.** Fable owns same-family escalation, and Terra ≈ Sol review quality at lower cost and latency.
- **Pair reviewers on different tasks, not the same task.** Two reviewers agreeing is weak evidence, and cross-vendor pairs are the *most* correlated. The value comes from distinct lenses — one on strategy and adversarial pressure, one on factual grounding against sources. Corollary: don't send a reviewer an artifact it helped write.
- **Exception — adversarial planning on an unsolved problem is generation, not corroboration.** Two reviewers *arguing opposite positions* on the same open problem produce candidate plans to weigh, not a claim two models endorsed, so the correlation argument doesn't bite. Reach for it on trigger 1 above; it is what unstuck `transcoder` on 2026-07-25 after ordinary sessions went round in circles. n=1 — a play worth trying when stuck, not a default, and never evidence the resulting plan is right.

**Reviewer names.** Defined in `~/.claude/CLAUDE.md`, which loads alongside this file. For convergence loops longer than the plugin's cap, drive `codex exec` directly — keeping its one non-negotiable rule: the reviewer never sees your self-assessment.

## Log noteworthy outcomes to the Obsidian vault

When a session in this tree produces a noteworthy outcome — a shipped feature, a published blog post or deploy, a completed experiment or training run, a merged PR on a flagship project — append a one-line entry to today's daily note in the vault without asking (standing approval, Jason 2026-07-05); mention in the reply that it was logged. Note path: `~/Documents/Main/Daily/YYYY-MM-DD - Daily.md`, create from `_templates/Daily.md` if missing; add under `## 🏆 Wins`. Format: `- HH:MM [repo-name] outcome in one sentence` plus a `[ship]`/`[arch]`/`[win]`-style tag. Routine edits, WIP commits, and exploration don't qualify. This keeps the vault's daily record from undercounting code-side output.

## Test runners by stack

When the `test-driven-development` skill is driving, quote the red→green transition using the repo's actual runner. Defaults by stack — use the repo's existing runner if it differs (check `package.json` scripts / `Makefile` / `pyproject.toml`):

| Stack | Run tests with |
|---|---|
| TS/JS (Node, Vite) | `npx vitest run` (or `pnpm vitest run`) |
| Cloudflare Workers | `npx vitest run` with `@cloudflare/vitest-pool-workers` |
| Python | `uv run pytest` |
| Rust | `cargo test` |
| Plugin/skill `.mjs` (claude-skills) | `node --test <file…>` |

## Implementation plan path

The `# Task N` files SDD executes go in `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`, or the repo's existing plans dir.
