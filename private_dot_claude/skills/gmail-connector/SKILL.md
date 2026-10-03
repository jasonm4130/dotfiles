---
name: gmail-connector
description: Pitfalls of the claude.ai Gmail connector. Load before reading a thread's state with search_threads, or before changing a reply draft.
---

**Gmail `search_threads` truncates each thread to five messages without saying so.** Never conclude anything about a thread's recent state from it: `get_thread` with `METADATA_ONLY` for the real message list, then fetch bodies by id.

**Gmail `update_draft` detaches a reply draft from its thread** (it is denied in settings for that reason). To change a threaded draft, create a replacement with `replyToMessageId`, trash the old one, and check `get_draft`'s `threadId`. Plain-text bodies get URLs rewritten to `google.com/url?q=` wrappers.

