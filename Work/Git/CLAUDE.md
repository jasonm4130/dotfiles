# Code Work (`~/Work/Git/**`)

Guidance that applies when working in any of Jason's code repos. Loaded lazily by Claude Code when a session works in this tree.

## LSP-First Code Navigation

When working in code files (TS, JS, Python, Rust, Go, etc.):

1. Use LSP `goToDefinition` instead of grepping for function/class definitions
2. Use LSP `findReferences` instead of grepping for symbol usages
3. Use LSP `hover` to check types instead of reading entire files
4. Use LSP `documentSymbol` to understand file structure
5. Only use Grep for: text searches, TODOs, string literals, log messages, config values
6. Only fall back to Grep when LSP returns empty results or is unavailable

The `lsp-first-guard.js` PreToolUse hook enforces this for Grep calls that look like code-symbol lookups; it doesn't replace the rule, just catches misses.

## Delegate with an explicit model tier

When dispatching the Agent tool, always set `model` explicitly — subagents otherwise inherit the session model, which on an Opus/Fable session runs searches and mechanical work at the most expensive tier (measured: 73% of dispatches leaked this way before this rule existed):

1. `model: 'sonnet'` — searches, file reads, mechanical implementation from a clear spec, test runs, verification. The default for delegated work.
2. `model: 'haiku'` — pure enumeration only (listing files/URLs/matches). Haiku misses subtle cross-source contradictions; don't use it for judgment.
3. `model: 'opus'` / `'fable'` — deliberately, when the delegated task itself needs frontier reasoning (architecture judgment, hard debugging). Setting it explicitly is fine; inheriting it silently is not.

Don't delegate at all when the task is trivial, tightly coupled to conversation context, or latency-sensitive — a fresh subagent pays a cold-start and relay-loss cost that outweighs the context saving (Anthropic's own docs warn the same).

The `workflow-model-guard` plugin's Agent hook enforces this — it denies untiered dispatches (except `fork` and agent types with pinned frontmatter models); it doesn't replace the rule, just catches misses.

**Effort is not available here.** `Workflow`'s `agent()` takes `opts.effort`; the plain `Agent` tool does not. For Agent dispatches the model tier above is the only lever. Inside a Workflow script, prefer holding the model and lowering effort over reaching for a cheaper model — Anthropic documents `low` as the fit for subagents specifically, and it buys fewer tool calls and no plan preamble, which is what an agent working from a settled spec wants. `subagent-driven-development` encodes this.

## Escalate to Fable on a trigger, not on a feeling

"This needs more reasoning" is a label applied after difficulty is already visible, which makes every rescue look like foresight and every wasted escalation look like judgment. Escalate when one of these fires, and say which one:

1. Two failed attempts at the same acceptance test or reproduction.
2. Competing architectural approaches where the choice is irreversible.
3. Security, data-loss, or production-migration risk in the change itself.
4. Evidence spanning several repos, or a system nobody in the session knows.
5. Adversarial review *after* an implementation is complete.

**Route Fable to planning and review, not to taking over implementation.** Published benchmarks put Opus 5 within a point of Fable 5 on SWE-bench Pro (79.2 vs 80.0) and ahead on SWE-bench Verified (96.0 vs ~95); Fable's separation shows on Terminal-Bench and FrontierCode — long-horizon and frontier work. Handing it routine implementation buys ~nothing at 2× price and higher latency. Trigger 5 is the highest-value one: if you conflate "Fable implemented it" with "a second pass caught it", you'll credit the model for what the second look did.

**Escalation means a new session or subagent at the higher tier, not raising effort in place.** Changing effort mid-conversation invalidates the prompt cache, so pick a level at the start of a session and hold it.

## Cross-provider review: run codex-review without being asked

The `codex-review` plugin (Codex / GPT-5.6 Terra) is a cross-family second opinion — it catches bug classes a same-family Claude review misses. Invoke the `codex-plan-review` skill automatically, without waiting to be prompted, at these gates:

1. **Plan gates** — right after a spec/plan/ADR is finalized *and user-approved* (a brainstorming spec, a writing-plans plan, an ADR draft, or an SDD plan confirmed at its gate). Plan mode, Terra/high effort.
2. **Before a PR** — after implementing a Codex-reviewed plan, run diff mode on `main...HEAD` before opening the PR. A reviewed plan is NOT a reviewed diff (proven: a branch that passed 3 plan rounds + an audit still shipped 3 real bugs that diff mode caught).

Keep it **whole-branch, not per-task**: one diff pass on `main...HEAD`, never a Codex call inside each SDD task (per-task pays N× the paid-call cost and N× the reviewer's over-rejection surface to catch strictly less). **Terra for automatic passes; escalate to Sol only when Jason asks for Sol by name** — Fable owns same-family escalation, and Terra ≈ Sol review quality at lower cost and latency. If `codex` is missing or not logged in, disclose the skip and continue without blocking — never block a gate, but the skip must be visible so a downstream consumer (e.g. SDD) knows the plan is unreviewed. Each chain burns ChatGPT-subscription quota, so never re-run on the same artifact without an explicit ask.

**Pair reviewers on different tasks, not the same task.** Two reviewers agreeing is weak evidence, and cross-vendor pairs are the *most* correlated. The value comes from distinct lenses — e.g. one on strategy and adversarial pressure, one on factual grounding against sources. That split has repeatedly found disjoint sets of real defects where duplicate reviews found the same thing twice. Corollary: don't send a reviewer an artifact it helped write.

**That rule governs *verifying* finished work. Adversarial planning on an unsolved problem is a different move.** Putting two reviewers on the same problem *arguing opposite positions* is generation, not corroboration — the output is candidate plans to weigh, not a claim two models endorsed, so the correlation argument doesn't bite. Reach for it on trigger 1 above (circling on the same target): a Fable-vs-Sol argument over the whole fix is what unstuck `transcoder` on 2026-07-25 after ordinary sessions went round in circles. n=1 and uncontrolled — a single fresh Fable pass might have done the same — so treat it as a play worth trying when stuck, not a default, and never as evidence the resulting plan is right.

**The `codex-review` plugin hard-caps at 3 review rounds plus 1 audit** and refuses a 4th before spending a paid call. For longer convergence loops, drive `codex exec` directly — but keep the plugin's one non-negotiable prompt rule: **the reviewer must never see your self-assessment.** Pass the file path, never your own confidence, never "I think this is now correct".

## Log noteworthy outcomes to the Obsidian vault

When a session in this tree produces a noteworthy outcome — a shipped feature, a published blog post or deploy, a completed experiment or training run, a merged PR on a flagship project — append a one-line entry to today's daily note in the vault without asking (standing approval, Jason 2026-07-05); mention in the reply that it was logged. Note path: `~/Documents/Obsidian Vault/Daily/YYYY-MM-DD - Daily.md`, create from `_templates/Daily.md` if missing; add under `## 🏆 Wins`. Format: `- HH:MM [repo-name] outcome in one sentence` plus a `[ship]`/`[arch]`/`[win]`-style tag. Routine edits, WIP commits, and exploration don't qualify. This keeps the vault's daily record from undercounting code-side output.

## Test runners by stack

When the `test-driven-development` skill is driving, quote the red→green transition using the repo's actual runner. Defaults by stack — use the repo's existing runner if it differs (check `package.json` scripts / `Makefile` / `pyproject.toml`):

| Stack | Run tests with |
|---|---|
| TS/JS (Node, Vite) | `npx vitest run` (or `pnpm vitest run`) |
| Cloudflare Workers | `npx vitest run` with `@cloudflare/vitest-pool-workers` |
| Python | `uv run pytest` |
| Rust | `cargo test` |
| Plugin/skill `.mjs` (claude-skills) | `node --test <file…>` |

## Spec, plan & ADR paths

- **Design / brainstorming specs** → `docs/superpowers/specs/YYYY-MM-DD-<slug>.md`
- **Implementation plans** (the `# Task N` files SDD executes) → `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`, or the repo's existing plans dir
- **ADR-driven change records** (the `adr` skill's output) → `docs/adr/YYYY-MM-DD-<slug>.md`
