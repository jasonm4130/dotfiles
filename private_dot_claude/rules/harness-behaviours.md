---
description: Claude Code harness behaviours that fail silently — sandbox writes, worktree isolation, WebFetch, GUI automation
---

# Harness behaviours that fail quietly

Moved out of the global CLAUDE.md: it is Claude-only and had grown to 13% of that
file. An unscoped rule here loads for every session regardless of cwd.

**`WebFetch` loses to bot protection more often than it admits.** Cloudflare Browser Rendering self-identifies as a bot by design, so a permissive `robots.txt` is not access — probe for the 403. Drive Chrome instead, and screenshot when `get_page_text` returns junk.

**Never drive a native GUI by screen coordinate.** `osascript ... click at {x, y}` and `screencapture -R` address the *screen*, not an app, and focus does not survive between Bash calls — an `activate` in one call is gone by the next, so the click lands in whatever came forward. No dry run, no undo. Two clicks meant for a settings tab landed instead on a print flow, sending a multi-hour job to a physical printer, and in a mail draft — that one also dumping the draft body, including a password, into tool output. Read state from files, not pixels; when only the GUI can answer, ask him to click. Coordinate clicking has no safe case, because you cannot know what is under the cursor. Full-screen `screencapture` is the same bug in miniature: capture one window's bounds or nothing.

**Gmail `search_threads` truncates each thread's message list to five, with nothing saying so.** A thread with fifteen messages returns its first five and reads exactly like a complete thread, so "no reply since the 13th" is a claim the listing cannot support. It produced a confident, wrong "the building manager has never answered" when they had answered eight days earlier, substantively. **Never conclude anything about a thread's recent state from `search_threads` — `get_thread` with `METADATA_ONLY` for the real message list, then fetch bodies by id.** Same class as any paginated API read as a full set: a listing is evidence of what exists, never of what does not. The tell is a thread whose newest listed message predates something you already know happened on it.

**Gmail `update_draft` silently detaches a reply draft from its thread.** It returns a *new* `threadId` and the draft then sends as a fresh email rather than a reply — the correspondence chain a recipient (or an adjudicator) reads is broken, and nothing errors. `replyToMessageId` exists only on `create_draft`. **To change a threaded draft, create a replacement with `replyToMessageId` and trash the old one; never update in place.** Verify after creating: `get_draft` and check `threadId` matches the target thread. Note also that a plain-text body gets converted to HTML with URLs rewritten to `google.com/url?q=…` wrappers in the visible text — re-paste bare URLs in the composer when the link itself matters.
