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

## Cross-provider review: run codex-review without being asked

The `codex-review` plugin (Codex / GPT-5.6 Terra) is a cross-family second opinion — it catches bug classes a same-family Claude review misses. Invoke the `codex-plan-review` skill automatically, without waiting to be prompted, at these gates:

1. **Plan gates** — right after a spec/plan/ADR is finalized *and user-approved* (a brainstorming spec, a writing-plans plan, an ADR draft, or an SDD plan confirmed at its gate). Plan mode, Terra/high effort.
2. **Before a PR** — after implementing a Codex-reviewed plan, run diff mode on `main...HEAD` before opening the PR. A reviewed plan is NOT a reviewed diff (proven: a branch that passed 3 plan rounds + an audit still shipped 3 real bugs that diff mode caught).

Keep it **whole-branch, not per-task**: one diff pass on `main...HEAD`, never a Codex call inside each SDD task (per-task pays N× the paid-call cost and N× the reviewer's over-rejection surface to catch strictly less). **Terra for every pass; do not escalate to Sol** — Fable owns same-family escalation, and Terra ≈ Sol review quality at lower cost and latency. Skip silently if `codex` is missing or not logged in — never block a gate. Each chain burns ChatGPT-subscription quota, so never re-run on the same artifact without an explicit ask.

## Log noteworthy outcomes to the Obsidian vault

When a session in this tree produces a noteworthy outcome — a shipped feature, a published blog post or deploy, a completed experiment or training run, a merged PR on a flagship project — append a one-line entry to today's daily note in the vault without asking (standing approval, Jason 2026-07-05); mention in the reply that it was logged. Note path: `~/Documents/Obsidian Vault/Daily/YYYY-MM-DD - Daily.md`, create from `_templates/Daily.md` if missing; add under `## 🏆 Wins`. Format: `- HH:MM [repo-name] outcome in one sentence` plus a `[ship]`/`[arch]`/`[win]`-style tag. Routine edits, WIP commits, and exploration don't qualify. This keeps the vault's daily record from undercounting code-side output.

## Test runners by stack

Quote the red→green transition (per global AGENTS.md) using the repo's actual runner. Defaults by stack — use the repo's existing runner if it differs (check `package.json` scripts / `Makefile` / `pyproject.toml`):

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
