---
description: Claude Code harness behaviours that fail silently during code work — sandbox writes outside the primary repo, worktree isolation, non-interactive CLIs blocking on stdin
---

# Harness behaviours that fail quietly in code work

Split out of `harness-behaviours.md`, which keeps the rules about tools rather than files. Both load every session: `paths:` scoping is not verified at user level (see docs/claude-code.md in the dotfiles repo).

**The sandbox's write allowlist covers the session's primary repo and `$TMPDIR`, not sibling repos.** `git add`/`git commit` elsewhere under `~/Work/Git/` fails with `Operation not permitted` on `.git/index.lock`; re-run that call with `dangerouslyDisableSandbox: true`. The asymmetry misleads: `Edit`/`Write` are not sandboxed the same way, so editing a file there is no evidence that committing it will work. Same class as LAN hostnames not resolving and `gh` failing TLS — on "Operation not permitted" or a resolver error, suspect the sandbox before the command. Separately, a hook denying `git commit` denies the *whole* Bash call, so a chained `git add … && git commit …` leaves nothing staged; stage in its own call.

**`Agent` with `isolation: "worktree"` resolves against an ambient directory, not the repo your prompt names.** In a multi-repo session it launches into the wrong repo's worktree, and one that dies a minute in sends no failure notification — it just reads as "still running", indefinitely. Prefer telling the agent to `gh repo clone` fresh into the scratchpad; if using worktree isolation anyway, make its first instruction "verify `git remote -v` matches <repo>, else clone fresh". A silent background agent is not a working agent — `stat -L` its output file; one that stopped growing is dead.

**`codex exec` reads stdin even when the prompt is passed as an argument.** Without `< /dev/null` it hangs forever on "Reading additional input from stdin...", which looks identical to a long review running. Same family as the `pi -p` hang. Redirect stdin on every non-interactive CLI launched in the background, and when a background job produces no output for minutes, check whether it is *blocked* before assuming it is *working*.
