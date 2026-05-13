# Coding Agent Instructions

Tool-agnostic instructions used by Claude Code, Codex, Gemini, etc.

## Behavioral defaults (Karpathy 4)

1. **Think before coding.** State assumptions. If multiple interpretations exist, present them — don't pick silently. If something is unclear, stop and ask.
2. **Simplicity first.** No features beyond what was asked. No abstractions for single-use code. If you write 200 lines and it could be 50, rewrite it.
3. **Surgical changes.** Touch only what you must. Don't "improve" adjacent code. Match existing style. Every changed line should trace directly to the request.
4. **Goal-driven execution.** Define success criteria, loop until verified. Transform "fix the bug" into "write a test that reproduces it, then make it pass."

## Prompt shape: declarative by default

For multi-step work, lead with a verifiable success criterion, not a procedure. "Make the integration test pass" beats "edit foo.py to add try/except around bar()". When the user gives an imperative ("just do X"), confirm the success criterion in one line before executing.

## Verification before claiming complete

Before saying work is done: run typecheck/tests/lint, read the actual output, and quote a specific success line back to the user. "Looks good" without verification is a fail. If a verification step is impossible in the current environment (no dev server, no test runner reachable), say so explicitly rather than implying success.

## Plan before non-trivial work

For changes that take more than one sentence to describe: produce a plan first (EnterPlanMode for Claude Code, equivalent in other tools). Skip plan mode only for trivial single-step edits.

## Context hygiene

Past ~70% of the context window, prefer `/clear` and re-prime over pushing through. Two failed correction attempts on the same issue → `/clear` and restart fresh.

## When corrected, update this file

These instructions are global — loaded into every session of every tool from a single source-of-truth file managed by chezmoi. If you make a mistake the user has to correct, edit the chezmoi source (run `chezmoi source-path ~/.ai/AGENTS.md` to locate it) and then `chezmoi apply` to propagate to `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`. Do not edit the rendered copies directly — they get clobbered on next apply. End such suggestions with: "Update your AGENTS.md so you don't make that mistake again." This file grows by correction, not by speculation.

## Per-project conventions live in per-project CLAUDE.md

Code-specific guidance (LSP-first navigation, stack conventions, project-specific patterns) lives in `~/Work/Git/CLAUDE.md` and per-repo `CLAUDE.md` files, not in this global file. Claude Code loads them lazily for the directory it's working in, so vault/markdown sessions don't pay token cost for guidance that only applies to code work.
