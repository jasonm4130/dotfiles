---
name: llm-wiki
description: Check Jason's LLM wiki before researching a topic from scratch - before web fetches or searches for background, a research subagent, deep-research, or a workflow. Not for a single live fact such as today's price or latest version.
---

The wiki lives at `~/Work/Git/llm-wiki`. Read its `index.md`, or run
`python3 scripts/qmd_bootstrap.py --exec query "<question>" < /dev/null` from inside it
(Claude sessions with the `wiki` MCP server can query that instead).

Its claims are dated: still re-verify anything time-sensitive. From another repo, write to it
only through its `inbox/`, following its AGENTS.md.
