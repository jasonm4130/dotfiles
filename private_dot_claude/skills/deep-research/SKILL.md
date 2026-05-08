---
name: deep-research
description: Use when the user asks for multi-source research, investigation, or a "deep dive" on a topic — phrases like "research X", "deep research on X", "investigate X", "look into X", "what's the state of X", or "compare options for X". Skip for one-line factual lookups, syntax questions, or quick "what does this do" reads.
---

# Deep Research

Multi-angle research via parallel sub-agents and multiple web sources, then synthesis with citations. Follows the lead-researcher → parallel sub-agents → synthesis pattern from Anthropic's [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system).

## Triage First

Before spawning agents, decide: deep research or quick lookup?

| Signal | Action |
|--------|--------|
| Multiple angles, comparisons, "state of X", trade-offs, "what are people doing" | Run the full process |
| One-shot factual question, syntax lookup, "what does this return" | Answer directly with one search; do NOT use this skill |
| Ambiguous | Ask: "Quick lookup or a multi-angle deep dive?" |

When in doubt, ask. Burning 4 parallel agents on a question that needed one search wastes tokens and time.

## Process

### 1. Frame the angles and ASK
List 3–5 distinct research angles. Default to 3; go to 5 only if the topic genuinely splits that many ways. Each angle should be answerable independently.

**Always show the angles to the user and wait for explicit go-ahead before dispatching.** Even when the user said "do deep research" — that's permission for the topic, not for the dispatch. Parallel sub-agents burn meaningful tokens; the user gets to confirm scope first. A reply like "looks good, go" or "yes" is the gate.

The only exception: the user explicitly said "skip the confirmation, just run it" or equivalent.

### 2. Dispatch parallel sub-agents
Spawn one `Agent` (subagent_type=general-purpose) per angle, **all in a single message** so they run concurrently. Sequential `Agent` calls = wasted wall-clock.

Each agent's prompt must include:
- The specific angle/question.
- The broader research topic for context.
- "Use both Exa and Tavily MCP tools (any `mcp__exa__*` and `mcp__tavily__*` tools). Fall back to WebSearch for breadth and WebFetch for specific URLs."
- "Read 2–4 sources deeply, not 10 shallowly."
- "Cite every claim: URL + title + date."
- "Report under 400 words."

### 3. Synthesize
Combine the agent reports in the parent session:
- **Key findings** first — the 3–6 things the user actually needs.
- **Details** — supporting nuance per angle.
- **Contradictions** — flag where sources disagree, don't paper over them.
- **Open questions** — what wasn't answered and what would answer it.

### 4. Cite explicitly
End with a `## Sources` section listing every URL referenced, grouped by angle. For substantial research (>1000 words synthesis), also offer to write `RESEARCH_<topic>.md` in the working directory so the user can keep it.

## Source diversity
If 3+ findings trace to one domain, flag it ("most of this comes from <domain>; treat as one perspective"). Diversity beats volume.

## Tool preference
Prefer in this order: `mcp__exa__*` (semantic, well-ranked), `mcp__tavily__*` (fast, broad), `WebSearch` (fallback), `WebFetch` (specific URLs). Use Exa AND Tavily — different rankings catch different sources.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Sequential `Agent` calls | All parallel `Agent` calls go in one message |
| Dispatching without confirming angles | Show the angles, wait for "go". "Do deep research" is topic permission, not dispatch permission. |
| Skipping triage | Ask before spawning if intent is unclear |
| One source per claim | Cross-reference; flag single-source claims |
| Burying contradictions | Surface them; that's often the most useful output |
| Linking without reading | Each agent reads 2–4 sources, doesn't just dump SERPs |
| Hallucinating citation URLs | If a URL came from a model not a search result, don't cite it |
