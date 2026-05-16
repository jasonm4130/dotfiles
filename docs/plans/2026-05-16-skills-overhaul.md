# Skills Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `deep-research` and `grill-me` skills using 2025–26 multi-agent research findings, then use the refined `deep-research` to design two new artefacts: an `adversarial-agents` skill (the generic form of grill-me's panel pattern) and a conversation-guidance block added to global `CLAUDE.md`.

**Architecture:** Phased — refine the research tool first, then use the refined tool for the next research round. Phases 1–2 are concrete skill edits. Phase 3 is a research dispatch + synthesis. Phase 4 is a deliberate "stop here and write a follow-up plan" gate, since the implementation specs for adversarial-agents and the CLAUDE.md block depend on what Phase 3 research returns.

**Skills affected:**
- `~/.claude/skills/deep-research/SKILL.md` — refactor
- `~/.claude/skills/grill-me/SKILL.md` — retro
- `~/.claude/skills/adversarial-agents/SKILL.md` — new (Phase 5, follow-up plan)
- `~/.ai/AGENTS.md` (chezmoi source for `~/.claude/CLAUDE.md`) — conversation-guidance block (Phase 5, follow-up plan)

**Scope-check note:** The skill recommends splitting multi-subsystem plans. I'm keeping these together because (a) they share a critical-path dependency — Phase 3 research uses the Phase 1 refactor; (b) the adversarial-agents design generalises the grill-me pattern; (c) user explicitly asked for one record to prevent context loss.

**Working-state contract:** Each task ends with all skills still functional. Don't proceed if a Verify step fails — debug, fix, then proceed.

---

## Decisions log (locked from grill-me + research session, 2026-05-16)

These decisions are settled. Re-open only with new evidence.

### grill-me v2 design (Phase 2 applies these)
- **Output:** pure conversation, no file written.
- **Architecture:** 3 parallel adversarial sub-agents dispatched in one message; outputs distilled into Socratic walk.
- **Personas (fixed):** YAGNI / Premortem / Hidden Assumptions.
- **Adversary tools:** plan text + codebase (Read/Grep/Bash) + web (Exa/Tavily/WebSearch), capped at 1–2 web searches per specific claim.
- **Adversary output format:** bullets, 1 line per critique, max ~10 per adversary.
- **Pacing:** post count summary, then walk one critique at a time, priority order across personas (not per-persona blocks).
- **Question form:** free-form Socratic.
- **Dismissal handling:** dog-with-bone — counter with strongest version of adversary's case until user gives concrete defense / amendment / explicit "park this".
- **Thin-plan handling:** if plan <~100 words or no concrete decisions, refuse and redirect to `brainstorming`.
- **Stop condition:** walk all critiques to resolve/park, then in-conversation recap.

### Research-driven refinements to grill-me v2 (Phase 2 adds these)
- **Pre-commitment gate:** before adversary dispatch, user types a 1-paragraph "what the plan is and why it's right". Adversaries attack both plan and defense. **Why:** documented sycophancy defense (Pocock, obra, fullo all use this); without it, skill-generated questions become leading cues.
- **Mandatory ≥1 finding per persona:** persona must return either a critique or "NO FINDINGS — and here are the 3 places I looked hardest and why they're solid." **Why:** prevents rubber-stamping (adversarial-reviewer published rule).
- **Severity-promotion on overlap:** critiques surfaced by 2+ personas get tagged `[CONVERGED]` and walked first. **Why:** convergence is the highest-signal indicator.
- **Counter-push cap: 3 (not 5):** research says 2–3 rounds captures most gain; 4+ is churn. **Why:** Khan et al. ICLR 2025; HAJailBench.
- **Named failure modes inside persona prompts:** each persona prompt enumerates its own anti-rationalizations ("verification avoidance", "seduced by the first 80%"). **Why:** ng/adversarial-review pattern lifted from Claude Code internals.
- **Verbatim critique quoting:** parent must quote the critic's critique verbatim when posing the Socratic question; no paraphrase. **Why:** Wynn et al. capability-asymmetry — parent (stronger model) tends to dilute weaker-model critique; verbatim preserves framing.

### deep-research refinements (Phase 1 applies these)
- **Plan-as-DAG, not flat fan-out:** lead emits 3–5 angles with dependencies; topological traversal; hard angles get follow-up round. **Why:** Digital Applied 2026, LangChain Deep Agents — current "decompose once, fan-out once" is a generation behind.
- **Critic vs Judge role split:** critic ≤2 passes (3+ is churn); citation-quality judge separate from synthesis judge. **Why:** Digital Applied 2026 — conflation is "single most common cause of deadlocks".
- **Cost-aware spawning:** default to frontier-orchestrator + Haiku critics. **Why:** Data Processing Inequality (single agents match multi at equal token budget); cost lever is asymmetric models. ~5–10× cheaper at similar quality for critic role.
- **Hard fan-out cap by token budget**, not angle count.
- **2-round structured debate for contested factual claims**, with documented note about cross-family judge bias (~70% in-family). Cross-family not feasible in current harness; documented as limitation.
- **Bounded critic loops:** explicit "max N passes" per critic role to prevent infinite churn.

### Reframed: claude-voice → CLAUDE.md conversation block
- Voice-consistency-across-multi-agent-dispatch is interesting research but not the user's actual need.
- Real need: a generic conversation-guidance block added to global `CLAUDE.md` (already loaded every session) that measurably improves everyday outcomes.
- Research scope (Phase 3) changes from "voice consistency" to "what house-style additions to global agent instructions measurably improve daily outcomes".

### Harness constraints (acknowledged, not in scope to fix)
- `Agent` tool dispatches to Claude only (`sonnet | opus | haiku`). Cross-family diversity (Kimi 2.6, GPT-5) requires MCP server or CLI bridge — net-new infra, separate project.
- Skills will note cross-family as the real diversity-of-thought win when infra exists, but default to Claude-only.

---

## Phase 1 — Refactor deep-research skill

### Task 1: Add DAG + critic/judge split to deep-research SKILL.md

**Files:**
- Modify: `~/.claude/skills/deep-research/SKILL.md`

- [ ] **Step 1: Read current SKILL.md to confirm baseline content**

```bash
cat ~/.claude/skills/deep-research/SKILL.md | head -80
```

Expected: file matches the version shown in this plan's session context (lead-researcher → parallel sub-agents → synthesis baseline).

- [ ] **Step 2: Replace `## Process` section header and `### 1. Frame the angles and ASK` with a DAG-aware version**

Old text to replace (the section currently starts with `## Process` followed by `### 1. Frame the angles and ASK`):

Replace `### 1. Frame the angles and ASK` body with this new content:

```markdown
### 1. Plan the angles as a DAG, then ASK

Don't decompose once and fan out once. Real research questions have dependencies — one angle's answer shapes whether a second angle is even worth running.

1. List 3–5 distinct research angles. Default to 3; go to 5 only if the topic genuinely splits that many ways.
2. For each angle, name its **dependencies** — does it need another angle's output to be well-posed? Most angles are independent (root nodes). Some are conditional ("only worth researching if angle 2 returns X").
3. Render the plan as a small DAG: root angles first (run in parallel), dependent angles in a second wave.

**Always show the DAG to the user and wait for explicit go-ahead before dispatching.** Even when the user said "do deep research" — that's permission for the topic, not for the dispatch. A reply like "looks good, go" or "yes" is the gate.

The only exception: the user explicitly said "skip the confirmation, just run it" or equivalent.
```

- [ ] **Step 3: Verify the edit**

```bash
grep -A 10 "### 1. Plan the angles as a DAG" ~/.claude/skills/deep-research/SKILL.md
```

Expected: prints the new section header and content; old `### 1. Frame the angles and ASK` is gone.

- [ ] **Step 4: Replace `### 2. Dispatch parallel sub-agents` with topological-traversal version**

Replace the entire `### 2. Dispatch parallel sub-agents` section with:

```markdown
### 2. Dispatch root angles in parallel (wave 1)

Spawn one `Agent` per root angle, **all in a single message**, so they run concurrently.

**Cost-aware defaults:**
- `subagent_type=general-purpose`
- `model="haiku"` for critic-style angles (recall, list-gathering, source enumeration). Haiku is ~5–10× cheaper than Sonnet/Opus for this role and matches quality for pattern-recognition work.
- `model="sonnet"` (default) for synthesis-heavy angles (cross-source reasoning, contradictions).
- Reserve `model="opus"` for the orchestrator (this session), not sub-agents — research shows asymmetric models (frontier orchestrator + cheap subs) is the cost-effective configuration. Same-model panels lose the Data Processing Inequality argument.

Each agent's prompt must include:
- The specific angle/question.
- The broader research topic for context.
- "Use both Exa and Tavily MCP tools (any `mcp__exa__*` and `mcp__tavily__*` tools). Fall back to WebSearch for breadth and WebFetch for specific URLs."
- "Read 2–4 sources deeply, not 10 shallowly."
- "Cite every claim: URL + title + date."
- "Report under 400 words."

### 3. Dispatch dependent angles (wave 2, optional)

If any wave-1 result triggers a dependent angle on the DAG, dispatch wave 2 now — again, all in one message. Stop at wave 2 unless an answer is materially blocked; deeper recursion is rarely worth the cost.
```

- [ ] **Step 5: Renumber the synthesis and citation sections**

The old `### 3. Synthesize` and `### 4. Cite explicitly` are now `### 4. Synthesize (after critic + judge passes)` and `### 5. Cite explicitly`. Renumber and apply Task 2's content to the new section 4.

```bash
grep -n "^### " ~/.claude/skills/deep-research/SKILL.md
```

Expected: section numbering reads 1 (DAG plan), 2 (root dispatch), 3 (dependent dispatch), 4 (synthesize), 5 (cite). No duplicate numbers.

- [ ] **Step 6: Commit**

```bash
cd ~/.claude/skills/deep-research
git -C ~/.claude add deep-research/SKILL.md 2>/dev/null || true
```

Note: `~/.claude/skills/` may not be a git repo. If not, skip this commit step — the working copy is the record. If it is a git repo, run:

```bash
cd ~/.claude && git add skills/deep-research/SKILL.md && git commit -m "refactor(deep-research): add DAG planning + critic/judge split"
```

### Task 2: Add critic + citation-judge + final-judge roles to synthesis

**Files:**
- Modify: `~/.claude/skills/deep-research/SKILL.md`

- [ ] **Step 1: Replace `### Synthesize` body with critic + judge version**

The new `### 4. Synthesize (critic + citation-judge + final-judge passes)` body:

```markdown
### 4. Synthesize (critic + citation-judge + final-judge passes)

Three roles, distinct system prompts, in order. Conflating roles causes deadlocks where nothing ever ships.

**Critic pass (≤2 iterations):**
- Read all sub-agent reports.
- Produce a draft synthesis: key findings, details, contradictions, open questions.
- Internally critique it — what's missing, what's hand-waved, what's a single-source claim. Revise once.
- Hard cap at 2 critic passes; a 3rd produces churn, not improvement.

**Citation-quality judge (1 pass):**
- For each cited claim, verify: does the URL still resolve, does the cited source actually support the claim, is the source date present and reasonable?
- Flag (don't silently drop) any claim where the source is weak, missing, or where the cited text doesn't actually support the claim.
- Single-domain runs ≥3 findings get a "single-perspective" warning.

**Final-judge pass (1 pass):**
- Read the critiqued, citation-checked synthesis.
- Decide: ship to user, or send back to critic for one more round (rare — only if a major contradiction is unresolved).
- Output the final synthesis with: key findings first, details, contradictions, open questions, sources grouped by angle.

### 5. Cite explicitly

End with a `## Sources` section listing every URL referenced, grouped by angle, with date. For substantial research (>1000 words synthesis), also offer to write `RESEARCH_<topic>.md` in the working directory so the user can keep it.
```

- [ ] **Step 2: Verify**

```bash
grep -A 5 "### 4. Synthesize" ~/.claude/skills/deep-research/SKILL.md
grep -A 3 "Citation-quality judge" ~/.claude/skills/deep-research/SKILL.md
```

Expected: both print the new content.

- [ ] **Step 3: Add a 2-round-debate note to `## Source diversity` section**

Append to the existing `## Source diversity` section:

```markdown

## Debate for contested claims (optional)

For factual claims where sub-agent reports disagree and the disagreement is load-bearing for the synthesis:

1. Dispatch a 2-round structured debate: spawn two `Agent` calls in one message, each arguing one side of the disagreement, both citing sources.
2. Use the synthesis judge (above) as the debate judge.
3. Cap at 2 rounds; research (Khan et al. ICLR 2025) shows 2–3 rounds captures most gain.

**Limitation to document:** In-family judges (Claude judging Claude debaters) show ~70% positional bias in published evals. Cross-family judges (e.g., GPT or Kimi judging Claude debaters) avoid this but require MCP/CLI bridge infra not currently wired up. When that bridge exists, prefer cross-family judging for debate.
```

- [ ] **Step 4: Verify the full skill still parses and reads cleanly**

```bash
wc -l ~/.claude/skills/deep-research/SKILL.md
head -3 ~/.claude/skills/deep-research/SKILL.md
```

Expected: file has frontmatter, all sections numbered 1–5 sequentially, no duplicate headers.

---

## Phase 2 — Retro grill-me v2 with research findings

### Task 3: Add pre-commitment gate to grill-me

**Files:**
- Modify: `~/.claude/skills/grill-me/SKILL.md`

- [ ] **Step 1: Insert a new `## Pre-commitment gate` section between `## Triage first` and `## Dispatch the panel`**

New section content:

```markdown
## Pre-commitment gate (after triage, before dispatch)

After triage passes, ask the user for a 1-paragraph pre-commitment **before** dispatching the panel:

> Before I dispatch the adversaries: in one paragraph, state what you think the plan is and the strongest reason it's right. The adversaries will attack both the plan and this defense — pre-committing prevents the skill's questions from becoming leading cues that you sycophantically agree with.

Wait for the paragraph. If the user refuses or hand-waves ("just go", "no it's obvious"), counter once:

> The research on Socratic interview skills (Pocock, obra/superpowers, fullo) all build in this gate because skill-generated questions are documented sycophancy triggers without a pre-commit anchor. One paragraph — then we dispatch.

If user still refuses, dispatch anyway and note in the recap that no pre-commit was captured.

Include the pre-commit paragraph in each adversary's prompt so they can attack the defense, not just the plan.
```

- [ ] **Step 2: Verify**

```bash
grep -A 3 "## Pre-commitment gate" ~/.claude/skills/grill-me/SKILL.md
```

Expected: prints the new section.

### Task 4: Add mandatory ≥1 finding rule and named failure modes to persona prompts

**Files:**
- Modify: `~/.claude/skills/grill-me/SKILL.md`

- [ ] **Step 1: Append the mandatory-finding rule + named failure modes to each of the 3 persona prompts**

For each persona (YAGNI, Premortem, Hidden Assumptions), append two paragraphs at the end of the prompt body (inside the `>` blockquote):

```markdown
>
> **You MUST surface at least one critique.** If you genuinely cannot find one after looking hard, return: `NO FINDINGS — and here are the three places I looked hardest and why they're solid: [3 specific places].` Do not return a rubber-stamp "looks good."
>
> **Avoid these failure modes** (lifted from Claude Code internal anti-rationalization guards): verification avoidance ("the plan looks correct based on my reading" — not enough; check it), seduced by the first 80% (stopping at the obvious critiques and missing the structural ones), strawmanning (attacking a weaker version of the plan than what's written).
```

- [ ] **Step 2: Verify all 3 personas have the new content**

```bash
grep -c "MUST surface at least one critique" ~/.claude/skills/grill-me/SKILL.md
```

Expected: `3`

```bash
grep -c "Avoid these failure modes" ~/.claude/skills/grill-me/SKILL.md
```

Expected: `3`

### Task 5: Add severity-promotion on overlap

**Files:**
- Modify: `~/.claude/skills/grill-me/SKILL.md`

- [ ] **Step 1: Replace the `## Summarise the scope` section with the overlap-promotion version**

New body:

```markdown
## Summarise the scope (and tag overlaps)

After all three return, scan for **overlap** — critiques surfaced by 2+ personas, even if framed differently. Tag those `[CONVERGED]` and rank them first in the walk order; convergence across distinct personas is the highest-signal indicator of a real hole.

Post a one-line scope summary to the user:

> Panel returned: YAGNI {n}, Premortem {m}, Hidden Assumptions {k} — {n+m+k} critiques total, {c} converged across personas. Walking through converged first, then by adversary judgment of severity.

This gives the user budget visibility before the walk begins.
```

- [ ] **Step 2: Verify**

```bash
grep -A 3 "tag overlaps" ~/.claude/skills/grill-me/SKILL.md
```

Expected: prints the new section.

### Task 6: Change counter-push cap from 5 to 3, add verbatim-quote rule

**Files:**
- Modify: `~/.claude/skills/grill-me/SKILL.md`

- [ ] **Step 1: Change deadlock cap from 5 to 3**

Find the line in `## Walk one critique at a time`:

> **Deadlock cap:** if a single critique exceeds 5 counter-pushes without resolve / amend / explicit park, force a choice

Change `5` to `3`. Update the rationale text below it to reference research (Khan et al. ICLR 2025; HAJailBench): 2–3 rounds captures most gain; 4+ is churn.

- [ ] **Step 2: Add verbatim-quote rule as a new bullet in the same section**

In `## Walk one critique at a time`, add a new step before "Dog-with-bone evaluation":

```markdown
**Quote the critique verbatim.** Do not paraphrase the adversary's wording when posing the Socratic question. Research (Wynn et al. ICML 2025) shows the parent (stronger model) tends to dilute weaker-model critique through paraphrase; verbatim preserves the critic's framing and resists capability-asymmetry drift.
```

- [ ] **Step 3: Verify both changes**

```bash
grep "exceeds 3 counter-pushes" ~/.claude/skills/grill-me/SKILL.md
grep "Quote the critique verbatim" ~/.claude/skills/grill-me/SKILL.md
```

Expected: both grep commands return a hit.

### Task 7: Update grill-me description to reflect the additions

**Files:**
- Modify: `~/.claude/skills/grill-me/SKILL.md`

- [ ] **Step 1: Update frontmatter `description`**

Old `description:` line:

```
description: Stress-test a plan or design by dispatching an adversarial panel (YAGNI / Premortem / Hidden Assumptions) and walking the user through every critique one at a time. Use when user wants to grill a plan, get holes found, pressure-test a design, or mentions "grill me".
```

New `description:` line:

```
description: Stress-test a plan by capturing a pre-commit defense from the user, then dispatching an adversarial panel (YAGNI / Premortem / Hidden Assumptions) that attacks both plan and defense. Walks the user through every critique one at a time with verbatim quoting and convergence-prioritised ordering. Use when user wants to grill a plan, pressure-test a design, find holes, or mentions "grill me".
```

- [ ] **Step 2: Verify**

```bash
head -5 ~/.claude/skills/grill-me/SKILL.md
```

Expected: new description line present in frontmatter.

### Task 8: Smoke-test grill-me v2.1 on a real plan

**Files:** none (interactive test)

- [ ] **Step 1: Invoke grill-me on this very plan as the test artefact**

In a fresh session, type: `/grill-me — grill me on docs/plans/2026-05-16-skills-overhaul.md`

- [ ] **Step 2: Verify all new behaviours fire**

Checklist:
- [ ] Triage proceeds (plan is clearly not thin)
- [ ] Pre-commit gate fires and asks for a paragraph
- [ ] 3 adversaries dispatch in a single message (one tool-use round, three Agent calls)
- [ ] Scope summary includes `[CONVERGED]` count
- [ ] First walked critique is from `[CONVERGED]` set if any exist
- [ ] Critiques are quoted verbatim, not paraphrased
- [ ] Dog-with-bone caps at 3 pushes, not 5
- [ ] Recap at end lists Resolved / Parked

- [ ] **Step 3: Capture any drift or bug as follow-up tasks in the next planning iteration**

If any checklist item fails, note it; the fix goes in the follow-up plan, not as a hot-patch here.

---

## Phase 3 — Research adversarial-agents and CLAUDE.md guidance using refined deep-research

### Task 9: Dispatch wave-1 research using the refined deep-research skill

**Files:** none (research dispatch); output → in-conversation synthesis and saved file in Task 10

- [ ] **Step 1: Plan the DAG**

Per Phase 1's refined deep-research process, plan angles as a DAG before dispatch. Three root angles, no dependents needed for wave 2 (this research is concrete-design-oriented, not cascading):

**Root angle A — Adversarial-agents skill design.** What does a *generic* adversarial-agents skill look like that supports configurable panels (not just YAGNI/Premortem/Hidden Assumptions)? Look for: configurable persona libraries, panel-selection heuristics ("which adversaries fit this artefact"), how to handle non-plan inputs (code reviews, design docs, prose, model outputs), known production patterns for adversarial review as a service.

**Root angle B — Generic conversation-guidance for global agent instructions.** What concrete additions to a global `CLAUDE.md` / `AGENTS.md` measurably improve everyday conversation outcomes? Look for: published anti-sycophancy phrasing, brevity rules, one-Q-before-guessing patterns, anti-corporate-speak rules, evidence on which house-style rules transfer across models. Bias toward concrete prompt fragments with citations, not philosophy.

**Root angle C — Evaluation harness for adversarial / interview skills.** How do practitioners measure whether their adversarial / interview skills are doing real work? Look for: seeded-flaws benchmarks, disagreement-over-rounds metrics, answer-flip diagnostics, recall on planted holes. Output → an evaluation section to include in the adversarial-agents skill (so we can tell if it's working).

No wave-2 dependents identified.

- [ ] **Step 2: Show the DAG to the user and wait for explicit go-ahead**

Per refined skill: even with prior research permission, dispatch is its own gate.

- [ ] **Step 3: Dispatch wave-1 with Haiku critics**

Spawn 3 `Agent` calls in one message:
- `subagent_type=general-purpose`
- `model="haiku"` for angles A and C (recall/enumeration heavy)
- `model="sonnet"` for angle B (synthesis-heavy across diverse house-style sources)

Each prompt includes: angle text, broader topic context, Exa+Tavily instructions, "read 2–4 deeply", "cite URL + title + date", "report under 400 words".

- [ ] **Step 4: Verify dispatch**

Expected: one assistant message containing exactly 3 `Agent` tool-use blocks, fired in parallel.

### Task 10: Synthesise with critic + citation-judge + final-judge passes; save synthesis

**Files:**
- Create: `~/Work/Git/dotfiles/docs/plans/2026-05-16-skills-overhaul-research.md`

- [ ] **Step 1: Run critic pass (≤2 iterations)**

Per refined skill: draft synthesis, self-critique once, revise once. Hard cap at 2.

- [ ] **Step 2: Run citation-quality judge pass**

For each cited claim: URL resolves, source supports claim, date present. Flag weak claims explicitly.

- [ ] **Step 3: Run final-judge pass**

Decide: ship or one more critic round. Default: ship.

- [ ] **Step 4: Write synthesis to file**

```bash
test -d ~/Work/Git/dotfiles/docs/plans && echo "dir ok"
```

Expected: `dir ok`

Write `2026-05-16-skills-overhaul-research.md` with sections: Key findings · Details by angle · Contradictions · Open questions · Sources grouped by angle.

- [ ] **Step 5: Verify file written**

```bash
ls -la ~/Work/Git/dotfiles/docs/plans/2026-05-16-skills-overhaul-research.md
wc -l ~/Work/Git/dotfiles/docs/plans/2026-05-16-skills-overhaul-research.md
```

Expected: file exists, non-empty.

- [ ] **Step 6: Commit**

```bash
cd ~/Work/Git/dotfiles && git add docs/plans/2026-05-16-skills-overhaul-research.md && git commit -m "docs(plans): research synthesis for adversarial-agents + CLAUDE.md conversation block"
```

---

## Phase 4 — Write follow-up plan for implementation

### Task 11: Write follow-up plan based on Phase 3 research

**Files:**
- Create: `~/Work/Git/dotfiles/docs/plans/2026-05-16-skills-overhaul-followup.md`

- [ ] **Step 1: Re-grill key design decisions before writing the implementation plan**

The user has the refined `/grill-me` now. Use it on the *design* of the adversarial-agents skill and the CLAUDE.md block before writing the implementation plan. The pre-commit + adversarial panel will catch design flaws cheaper than catching them post-write.

Invoke: `/grill-me — grill me on the proposed adversarial-agents skill design from Phase 3 research`

Then: `/grill-me — grill me on the proposed CLAUDE.md conversation-guidance block from Phase 3 research`

- [ ] **Step 2: Write the follow-up plan using writing-plans skill**

Plan structure (template; fill from research):

- Phase 5 — Implement adversarial-agents skill at `~/.claude/skills/adversarial-agents/SKILL.md`
- Phase 6 — Add conversation-guidance block to `~/.ai/AGENTS.md` (chezmoi source) and `chezmoi apply` to propagate to `~/.claude/CLAUDE.md`
- Phase 7 — Backport relevant patterns from adversarial-agents into grill-me if the generic version supersedes some grill-me code
- Phase 8 — Smoke-test the CLAUDE.md block in a fresh session and measure (subjectively) whether the changes hold

- [ ] **Step 3: Commit follow-up plan**

```bash
cd ~/Work/Git/dotfiles && git add docs/plans/2026-05-16-skills-overhaul-followup.md && git commit -m "docs(plans): follow-up plan for adversarial-agents + CLAUDE.md block"
```

- [ ] **Step 4: Update this plan's tail with a pointer**

Add a line at the bottom of this file:

```markdown

---

**Follow-up:** `docs/plans/2026-05-16-skills-overhaul-followup.md` covers Phase 5+ (adversarial-agents skill implementation, CLAUDE.md block, backport, smoke-test).
```

---

## Open questions (not blocking, surface during execution)

These were left unresolved by Phase 3 research and should be carried into the follow-up plan as decision points:

1. **Persona naming convention for adversarial-agents.** Are personas YAML-defined in a library file (`~/.claude/skills/adversarial-agents/personas/*.yaml`) or inline-defined per invocation? Library is more reusable but more ceremony.
2. **CLAUDE.md block placement.** Top of file (always visible to model), bottom (least disrupts existing structure), or a new dedicated section? Affects discoverability and override semantics.
3. **Cross-family debater infra.** Worth scoping a follow-up project to wire up Kimi/OpenAI as Agent-dispatchable backends via MCP? Research says it's the real diversity-of-thought win; current setup forfeits that gain.
4. **Benchmark for grill-me.** Worth assembling a small seeded-holes benchmark (3–5 historical plans with known issues) to measure recall of the panel after each retro? Cheap once built, but a real time investment.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Phase 1 refactor breaks deep-research silently (no test suite) | Smoke-test by running a small deep-research on a low-stakes topic immediately after Phase 1 |
| Phase 2 grill-me changes make it more annoying to use (over-grilling) | Task 8 smoke-test on this very plan surfaces this; tune counter-push or pre-commit if too sticky |
| Phase 3 research returns shallow because Haiku critics strawman | Synthesis judge should catch this; if it doesn't, re-dispatch the weak angle with Sonnet |
| Phase 4 follow-up plan grows unbounded | Cap follow-up at 4 phases; if more needed, write a second follow-up |
| The whole effort generates more skill ceremony than value | Each phase ends with a working state; bail after any phase if the marginal value isn't there |
