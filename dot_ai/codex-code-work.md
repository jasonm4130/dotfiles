# Code work in Codex

These conventions apply under `~/Work/Git/`. Repository instructions supply
the project's commands and invariants. The September 2026 migration record is
`~/.local/share/chezmoi/docs/codex-migration-2026-09-06.md`.

## Models and reviews

Astra at medium effort is the interactive orchestrator. For substantial delegated
implementation, use `~/.codex/skills/work-loop/SKILL.md`: Terra handles bounded
work, Sol handles harder implementation via `codex exec --profile work-sol`,
and fresh Astra sessions provide focused advice and independent review.
Ordinary Codex launches load this workflow by default; `--profile work` remains
an explicit alias. Trivial edits stay local;
do not spawn agents merely because they are available. The legacy `review`
profile remains an explicit Terra read-only review, not the work-loop final reviewer.

Give each worker a bounded task, explicit model, checkout and acceptance check.
Use a fresh reviewer without the author's self-assessment or advisor transcript.
Verify findings against current code before changing it. Escalate after one
unsuccessful repair when another attempt would repeat the same uncertainty.
Higher reasoning effort needs a demonstrated reason, not a permanent blanket setting.
Sol means GPT Sol through the Codex CLI. Fable means Claude Fable; do not substitute
one for the other. A same-provider review is not cross-provider validation.

## Execution

Use language-server navigation when the current harness exposes it; otherwise
use targeted `rg` searches and file reads. Claude LSP plugins are not proof that
Codex has an LSP tool. Claude-specific tool names, Workflow scripts, hooks and
permission settings require a verified Codex equivalent before relying on them.

Give concurrent implementers separate worktrees and verify each worktree's
repository and branch. Keep Rust build output separate when concurrent runs
could contaminate acceptance checks. Prefer the project's existing runner:
`uv run pytest`, `cargo test`, the project's JS test script, or
`node --test <files>` for plugin scripts. Transcoder has its own nextest rules.
Plan files go in `docs/plans/YYYY-MM-DD-<slug>.md` unless the repo says otherwise.

Pass `< /dev/null` to background non-interactive Codex calls whose prompt is an
argument. Check process/output progress before assuming a quiet job is working.
Keep secrets in the established 1Password flow. Native GUI actions by screen
coordinate are prohibited by Jason's existing machine-use rule.

## Continuity and usage

Read the relevant migration resume point when first entering one of its four
projects. Treat prior transcripts and memory as leads; check Git and the actual
target before repeating a status claim or acting on a finding.
Keep a focused session per project. Preserve the goal, decisions, evidence and
next action in a handoff when switching; do not load entire historical sessions
into every prompt.

Use Codex's current usage/status display for remaining allowance and reset times.
`codex-usage` (or `codex-usage --json`) reads the account's reported windows
without a model call. Unavailable or stale readings are not a zero-cost signal.
Dashboard dollar estimates are not subscription balances. Do not buy credits,
switch to paid API fallback, or launch unattended workloads without approval.
Before an authorized long run, check 1Password readiness and the available
allowance. Set a bounded workload and reserve capacity for interactive work.

When a noteworthy outcome ships, append one line under `## 🏆 Wins` in
`~/Documents/Main/Daily/YYYY-MM-DD - Daily.md`, using the existing daily template
if needed. Format: `- HH:MM [repo-name] outcome [ship]` (or the appropriate tag).
Jason's standing approval covers these entries. Mention the entry in the reply;
routine edits, exploration and WIP do not qualify.
