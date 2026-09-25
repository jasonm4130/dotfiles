# Harness behaviours that fail quietly (Claude Code)

**`WebFetch` loses to bot protection more often than it admits.** A permissive `robots.txt` is not access; probe for the 403. Drive Chrome instead, and screenshot when `get_page_text` returns junk.

**Gmail `search_threads` truncates each thread to five messages without saying so.** Never conclude anything about a thread's recent state from it: `get_thread` with `METADATA_ONLY` for the real message list, then fetch bodies by id.

**Gmail `update_draft` detaches a reply draft from its thread** (it is denied in settings for that reason). To change a threaded draft, create a replacement with `replyToMessageId`, trash the old one, and check `get_draft`'s `threadId`. Plain-text bodies get URLs rewritten to `google.com/url?q=` wrappers.

**The sandbox's write allowlist covers the session's primary repo and `$TMPDIR`, not sibling repos.** `git add`/`commit` elsewhere under `~/Work/Git/` fails with `Operation not permitted` on `.git/index.lock`; re-run that call with `dangerouslyDisableSandbox: true`. `Edit`/`Write` succeeding there is no evidence a commit will. On "Operation not permitted" or a resolver error, suspect the sandbox before the command.

**`Agent` with `isolation: "worktree"` resolves against an ambient directory, not the repo your prompt names.** Prefer telling the agent to `gh repo clone` fresh into the scratchpad; otherwise make its first instruction "verify `git remote -v` matches <repo>". A silent background agent is not a working agent: `stat -L` its output file.

**Launch every non-interactive CLI in the background with `< /dev/null`.** `codex exec` reads stdin even with the prompt as an argument and otherwise hangs forever. When a background job is silent for minutes, check whether it is blocked before assuming it is working.
