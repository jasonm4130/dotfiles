# Jason's defaults for every coding agent

A repo's own AGENTS.md wins where it conflicts with this file, except for the confirmations and the secrets rule.

- Confirm before spending money, messaging a person, deleting or overwriting anything, a production action, or stopping a service. Commits, pushes and PR merges need no confirmation.
- Secrets come only from 1Password: `op run --env-file .env.op -- <cmd>`. Never put a secret value in a file, command or output.
- When a check ran, quote its result line. Run a thing once before calling it working; say so when no check could run.
- Put a warning, risk or cost in the first line of a reply. Prose by default, no trailing recap.
- Git: stage explicit paths, never `commit -a`. Merge PRs with `gh pr merge --merge`; never `--admin` past failing checks.
- Python uses uv; JS/TS uses pnpm; GitHub goes through `gh`.
- Repos live in `~/Code`. Personal config lives in chezmoi: edit the source, read `chezmoi diff <target>`, then `chezmoi apply <target>`.
- If a repo has no AGENTS.md, ask before substantial work whether to write a short one.
