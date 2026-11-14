# Jason's defaults for every coding agent

A repo's own AGENTS.md wins where it conflicts with this file, except for the confirmations and the secrets rule.

- Confirm before spending money, messaging a person, deleting or overwriting anything, a production action, or stopping a service. Commits, pushes and PR merges need no confirmation.
- Secrets come only from 1Password: `op run --env-file .env.op -- <cmd>`. Never put a secret value in a file, command or output.
- When a check ran, quote its result line. Run a thing once before calling it working; say so when no check could run.
- Put a warning, risk or cost in the first line of a reply. Prose by default, no trailing recap.
- Git: stage explicit paths, never `commit -a`. Merge PRs with `gh pr merge --merge`; never `--admin` past failing checks.
- Make changes in a git worktree, not the main checkout: Jason and other sessions commit there at the same time. Remove the worktree once its branch has merged.
- Run anything that waits more than about a minute (CI watches, deploys, playbooks, builds, poll loops) in the background, so it never blocks the chat; pick up its result when it finishes.
- Python uses uv; JS/TS uses pnpm; GitHub goes through `gh`.
- Runtimes come from mise: respect a repo's `mise.toml`, `.tool-versions`, `.nvmrc` or `engines`, and use `mise use` or `mise exec`, not brew, nvm or global installs. Global npm tools exist per Node version, so one installed under one version is missing under another; run `mise reshim` after installing.
- Repos live in `~/Code`. Personal config lives in chezmoi: edit the source, read `chezmoi diff <target>`, then `chezmoi apply <target>`.
- Before researching a topic from scratch, search Jason's LLM wiki: `python3 ~/Code/llm-wiki/scripts/qmd_bootstrap.py --exec query "<question>" < /dev/null`, or read `~/Code/llm-wiki/index.md`. Its claims are dated, so re-verify anything time-sensitive.
- A durable finding from other work goes to the wiki as one new file in `~/Code/llm-wiki/inbox/`, following that repo's AGENTS.md.
- If a repo has no AGENTS.md, ask before substantial work whether to write a short one.
