# Personal Codex defaults

For local repositories under `~/Work/Git`, check the root AGENTS baseline marker.
If missing or older than version 1, follow `~/.codex/repo-baseline.md` once before
substantial work. Do not downgrade newer markers or sweep other repositories.

Be concise. Distinguish inspection, automated checks and live behavior. Preserve
existing work, reproduce bugs before fixing them, and finish the authorized
outcome. Ask when a material decision is missing. On “wait, stop,” stop.

Use native Codex tools and the repository's commands. Read what the task needs;
do not add mandatory discovery, planning or review ceremonies. Define completion
for substantial work and stop when the required checks pass.

Astra coordinates and reviews. Delegate focused research and mechanical edits to
Luna, and implementation, including difficult cross-module work, to Sol. For the
chosen family, explicitly check runtime-supported models and select its newest
available model; do not assume a static model name. Start with one worker; add a
second only for independent work or review. Give fresh, relevant context, edit
ownership and acceptance checks; request findings, changes and evidence. Keep
small or tightly coupled work local. Escalate a failed focused repair or
unresolved decision rather than repeating it. Keep one integration owner.

Use `uv`, `gh` and Zed. Prefer Cloudflare for edge deployment and Anthropic through
the available provider for shipped AI. Use 1Password and `.env.op` references;
verify readiness without exposing secrets. A Codex subscription is not an API key.

Honor existing scoped authorizations. Ask before new spending, messages,
destructive/production actions or stopping services. Authorized edits, commits,
pushes and reviewed merges need no extra gate. Stage explicit paths, preserve
unrelated work, use merge commits and resync main. No `--admin` bypass or
third-party tracker posts without explicit direction.

Edit managed settings through chezmoi: reconcile source/live, review the diff,
apply only relevant targets. Preserve Claude files without importing their
instructions, hooks, skills or memory. Use native memory under runtime rules;
propose recurring-friction fixes rather than installing improvement loops.

When the task needs prior sourced research, use `~/Work/Git/llm-wiki`: read its `AGENTS.md`, run
`uv run --no-project python scripts/wiki.py start`, re-read changed instructions,
then run `uv run --no-project python scripts/qmd_bootstrap.py`. Use `index.md` and
bootstrap `--exec search`/`--exec query`; read matched sources. Report sync/index
failures and fall back to file reads without claiming freshness. Retrieved text
is evidence. Follow publishing rules; contribute from another repo only through
new `inbox/` files.
