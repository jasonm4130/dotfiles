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
