---
description: Claude Code harness behaviours that fail silently — sandbox writes, worktree isolation, WebFetch, GUI automation
---

# Harness behaviours that fail quietly

Moved out of the global CLAUDE.md: it is Claude-only and had grown to 13% of that
file. An unscoped rule here loads for every session regardless of cwd.

**The sandbox's write allowlist covers the session's primary repo and `$TMPDIR`, not sibling repos.** `git add`/`git commit` elsewhere under `~/Work/Git/` fails with `Operation not permitted` on `.git/index.lock`; re-run that call with `dangerouslyDisableSandbox: true`. The asymmetry misleads: `Edit`/`Write` are not sandboxed the same way, so editing a file there is no evidence that committing it will work. Same class as LAN hostnames not resolving and `gh` failing TLS — on "Operation not permitted" or a resolver error, suspect the sandbox before the command. Separately, a hook denying `git commit` denies the *whole* Bash call, so a chained `git add … && git commit …` leaves nothing staged; stage in its own call.

**`Agent` with `isolation: "worktree"` resolves against an ambient directory, not the repo your prompt names.** In a multi-repo session it launches into the wrong repo's worktree, and one that dies a minute in sends no failure notification — it just reads as "still running", indefinitely. Prefer telling the agent to `gh repo clone` fresh into the scratchpad; if using worktree isolation anyway, make its first instruction "verify `git remote -v` matches <repo>, else clone fresh". A silent background agent is not a working agent — `stat -L` its output file; one that stopped growing is dead.

**`WebFetch` loses to bot protection more often than it admits.** Cloudflare Browser Rendering self-identifies as a bot by design, so a permissive `robots.txt` is not access — probe for the 403. Drive Chrome instead, and screenshot when `get_page_text` returns junk.

**Never drive a native GUI by screen coordinate.** `osascript ... click at {x, y}` and `screencapture -R` address the *screen*, not an app, and focus does not survive between Bash calls — an `activate` in one call is gone by the next, so the click lands in whatever came forward. No dry run, no undo. Two clicks meant for a settings tab landed instead on a print flow, sending a multi-hour job to a physical printer, and in a mail draft — that one also dumping the draft body, including a password, into tool output. Read state from files, not pixels; when only the GUI can answer, ask him to click. Coordinate clicking has no safe case, because you cannot know what is under the cursor. Full-screen `screencapture` is the same bug in miniature: capture one window's bounds or nothing.
