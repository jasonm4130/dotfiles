# Jason's defaults for every coding agent

A repo's own AGENTS.md wins where it conflicts with this file, except for the confirmations and the secrets rule.

- Confirm before spending money, messaging a person, deleting or overwriting anything, a production action, or stopping a service. Commits, pushes and PR merges need no confirmation.
- Secrets come only from 1Password: `op-agent run --env-file .env.op -- <cmd>` reads the Agents vault with no prompt; anything outside it needs plain `op` and Jason's Touch ID. Never put a secret value in a file, command or output.
- When a check ran, quote its result line. Run a thing once before calling it working; say so when no check could run.
- Put a warning, risk or cost in the first line of a reply. Prose by default, no trailing recap.
- Git: stage explicit paths, never `commit -a`. Merge PRs with `gh pr merge --merge`; never `--admin` past failing checks.
- Make changes in a git worktree, not the main checkout: Jason and other sessions commit there at the same time. Remove the worktree once its branch has merged.
- Run anything that waits more than about a minute (CI watches, deploys, playbooks, builds, poll loops) in the background, so it never blocks the chat; pick up its result when it finishes.
- Python uses uv; JS/TS uses pnpm; GitHub goes through `gh`.
- Runtimes come from mise: respect a repo's `mise.toml`, `.tool-versions`, `.nvmrc` or `engines`, and use `mise use` or `mise exec`, not brew, nvm or global installs. Global npm tools exist per Node version, so one installed under one version is missing under another; run `mise reshim` after installing.
- Repos live in `~/Code`. `~/Code/AGENTS.md` maps them by area; read it when the user names a project outside the current repo or a task spans repos. Personal config lives in chezmoi: edit the source, read `chezmoi diff <target>`, then `chezmoi apply <target>`.
- Before researching a topic from scratch, search Jason's LLM wiki: `python3 ~/Code/llm-wiki/scripts/qmd_bootstrap.py --exec query "<question>" < /dev/null`, or read `~/Code/llm-wiki/index.md`. Its claims are dated, so re-verify anything time-sensitive.
- A durable finding from other work goes to the wiki as one new file in `~/Code/llm-wiki/inbox/`, following that repo's AGENTS.md.
- Memory: a fact about one repo under `~/Code` goes to `~/Code/.map/<repo>/memory.md`, quoting Jason's words on a `source:` line, committed on its own in `~/Code/.map` (`~/Code/AGENTS.md`, Memory section, has the rules). Claude Code loads that file through the repo's local imports; any other agent reads it on entering the repo. Rules for every repo go in this file, as a chezmoi diff. Never turn a one-session approval into a rule, and ask when the scope is unclear.
- If a repo has no AGENTS.md, ask before substantial work whether to write a short one.

## Working with Jason

- Jason is in Brisbane, Australia: default to Australian suppliers, standards and units.
- Walking Jason through decisions: one question per message, with a recommended answer.
- Optimise for output quality, not token cost; argue a model or effort change on quality or latency.
- Process: size the ceremony to the task at the plan; don't trim a non-trivial fix mid-flight; when review lands on a more robust design, recommend it rather than descoping.
- Before locking a design, run a cheap experiment or prior-art check on its load-bearing assumption ("quick experiments are wins").
- When Jason is learning a domain, go concept, then decision, then implementation, and pause at non-obvious choices; skip this for domains he knows.
- A static-limit failure gets a fix based on the signal behind it, not another static cap; a labelled stop-gap with a ticket is fine.
- After a mistake, add the cheapest check that would have caught it (test, lint, script) rather than a new prose rule.
- Present review findings (Codex, Grok, code review) as a one-sentence headline, what breaks if ignored, and the fix; raw output only on request.
- Before dispatching parallel research agents, show the proposed angles and wait for an explicit go.
- Jason's own surfaces (GitHub profile, portfolio) stay restrained: strong type, whitespace, one honest statement ("beautiful but simple, real not performance").

## Secrets, git and CI

- A secret seen in plaintext or printed in a transcript is exposed: say "rotate it" first; the new value goes into 1Password by Jason's hand, and the burned one is not migrated.
- If `op-agent` fails, or a needed item is outside the Agents vault, stop and hand Jason a `!` command rather than moving items yourself. A secret that resolves empty stops the run.
- A hanging `git commit` or "failed to fill whole buffer" means 1Password is locked: ask Jason to unlock it; signing stays on 1Password.
- Before making anything public, sweep for secrets and PII beyond gitleaks (tracked files, credential-shaped strings, long base64/hex, PEM headers, `/Users/` paths, full history file list) and report clean / mild PII / outstanding.
- Merge only when `gh pr checks <pr> --json bucket` shows no pending, fail or cancel and at least one pass; `--watch` can exit early.
- CI runs on the self-hosted k3s runners on the Dells; plain container runners are the default (Renovate and pnpm release-age delays keep dependency risk low), and the `-docker` label only for jobs that need a Docker daemon.
- ADRs are named `YYYY-MM-DD-<slug>.md`; a small change is a dated `## Amendments` block, a reversal is a new ADR that supersedes the old one; ADRs are not deleted. A repo's own convention wins.
