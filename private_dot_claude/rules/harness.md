# Harness behaviours that fail quietly (Claude Code)

**`WebFetch` loses to bot protection more often than it admits.** A permissive `robots.txt` is not access; probe for the 403. Drive Chrome instead, and screenshot when `get_page_text` returns junk.

**The sandbox's write allowlist covers the session's primary repo and `$TMPDIR`, not sibling repos.** `git add`/`commit` elsewhere under `~/Work/Git/` fails with `Operation not permitted` on `.git/index.lock`; re-run that call with `dangerouslyDisableSandbox: true`. `Edit`/`Write` succeeding there is no evidence a commit will. On "Operation not permitted" or a resolver error, suspect the sandbox before the command.

**`Agent` with `isolation: "worktree"` resolves against an ambient directory, not the repo your prompt names.** Prefer telling the agent to `gh repo clone` fresh into the scratchpad; otherwise make its first instruction "verify `git remote -v` matches <repo>". A silent background agent is not a working agent: `stat -L` its output file.

**Launch every non-interactive CLI in the background with `< /dev/null`.** `codex exec` reads stdin even with the prompt as an argument and otherwise hangs forever. When a background job is silent for minutes, check whether it is blocked before assuming it is working.
