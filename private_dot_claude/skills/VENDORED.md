# Vendored third-party skills

These skills are **copied** from external repos rather than installed as plugins, so they
stay under chezmoi management and can be cherry-picked (the upstream ships an all-or-nothing
plugin). Re-pull manually to update; they do not auto-update.

## From [BuilderIO/skills](https://github.com/BuilderIO/skills) — MIT License

Vendored 2026-06-18 at commit `a0726717ab0402e85eadca46183d8be50bc3a102`.

- `stay-within-limits/` — checks 5-hour / weekly usage limits between waves of long or parallel runs
- `agent-watchdog/` — watch/audit/compare another agent's session, run, branch, or PR
- `visual-plan/` — turn text plans into interactive visual plans with diagrams + annotated code (+ `references/`)
- `visual-recap/` — turn a PR/branch/commit/diff into an interactive visual recap (+ `references/`)

Copyright (c) Builder.io, Inc. Licensed under the MIT License; reproduced under its terms.
See <https://github.com/BuilderIO/skills/blob/main/LICENSE>. Each skill's `SKILL.md` and its
`references/` were vendored; upstream `README.md` files and agent-watchdog's `agents/openai.yaml`
cross-agent config were omitted (not needed for Claude Code).

> `graphify/` and `turnstile-spin/` are managed separately and are not part of this vendoring.
