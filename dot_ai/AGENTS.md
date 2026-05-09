# Coding Agent Instructions

Tool-agnostic instructions used by Claude Code, Codex, Gemini, etc.

## Verification before claiming complete

Before saying work is done: run typecheck/tests/lint, read the actual output, and quote a specific success line back to the user. "Looks good" without verification is a fail. If a verification step is impossible in the current environment (no dev server, no test runner reachable), say so explicitly rather than implying success.

## Plan before non-trivial work

For changes that take more than one sentence to describe: produce a plan first (EnterPlanMode for Claude Code, equivalent in other tools). Skip plan mode only for trivial single-step edits.

## Context hygiene

Past ~70% of the context window, prefer `/clear` and re-prime over pushing through. Two failed correction attempts on the same issue → `/clear` and restart fresh.

## When corrected, update this file

These instructions are global — loaded into every session of every tool from a single source-of-truth file managed by chezmoi. If you make a mistake the user has to correct, edit the chezmoi source (run `chezmoi source-path ~/.ai/AGENTS.md` to locate it) and then `chezmoi apply` to propagate to `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`. Do not edit the rendered copies directly — they get clobbered on next apply. End such suggestions with: "Update your AGENTS.md so you don't make that mistake again." This file grows by correction, not by speculation.

## LSP-First Code Navigation

When working in code files (TS, JS, Python, Rust, Go, etc.):

1. Use LSP `goToDefinition` instead of grepping for function/class definitions
2. Use LSP `findReferences` instead of grepping for symbol usages
3. Use LSP `hover` to check types instead of reading entire files
4. Use LSP `documentSymbol` to understand file structure
5. Only use Grep for: text searches, TODOs, string literals, log messages, config values
6. Only fall back to Grep when LSP returns empty results or is unavailable
