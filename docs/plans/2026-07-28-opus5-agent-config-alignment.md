# Opus 5 / Fable 5 agent-config alignment

**Date:** 2026-07-28
**Scope (confirmed):** dotfiles + claude-skills + the 8 repos committed to in the last week
**Cut depth (confirmed):** delete duplication + verification scaffolding; keep every dated incident rule
**Recurrence (confirmed):** dated marker + SessionStart check, no background job

Reviewers: Fable 5 (corpus audit) and GPT Sol via `codex exec` (hypothesis + mechanism). Split
deliberately — different lenses, not the same task.

---

## Phase 0 — Make the render script section-aware

`dot_ai/executable_render.sh:10-14` currently `cp`s one file to both `~/.claude/CLAUDE.md` and
`~/.codex/AGENTS.md`. That is why the duplicated blocks cannot simply be deleted: Codex has no
Anthropic-shipped system prompt, so guidance that is redundant for Claude Code is load-bearing there.

Add fenced markers and strip them per target:

```markdown
<!-- codex-only:start -->
...text Anthropic already ships into Claude Code...
<!-- codex-only:end -->
```

`render.sh` strips fenced blocks for the Claude render and keeps them for the Codex render.
`~/.ai/AGENTS.md` stays the unstripped source of truth.

This one change unblocks Phase 1 findings 1.1–1.3 and 4.2 together.

**Verify:** after `chezmoi apply`, `~/.claude/CLAUDE.md` is smaller than `~/.codex/AGENTS.md`, both
render without marker text leaking, and no non-fenced content is lost (`diff` the Codex render
against the pre-change file — it must be identical).

---

## Phase 1 — `dot_ai/AGENTS.md` surgery

### Move to codex-only (redundant with the shipped Claude Code system prompt)

| Location | Text | Why |
|---|---|---|
| rule 3 | "Length is selection, not compression… readable beats short" | Near-verbatim in the shipped prompt |
| rules 2–3 | "No features beyond what was asked", "Touch only what you must" | Shipped scope-discipline block |
| rule 2 | the 10-item banned-openers list | Shipped communication guidance; a literal follower does not need the enumeration |
| §Memory two stores | whole section (self-labelled "(Claude Code)") | Noise in the Codex render — invert the fence for this one |

Keep the "prose directives cut length ~88%" citation in both renders — it is the justification, and
Anthropic now agrees with it.

### Rewrite: `## Verification before claiming complete`

Anthropic's Opus 5 guidance says verification instructions now cause over-verification and removing
them costs no capability. But the section bundles two different things, and only one is on the
delete list:

- **The verification imperative** ("run typecheck/tests/lint before saying done") — DELETE. Opus 5
  does this unprompted.
- **The anti-fabrication rule** ("quote a specific success line"; "if a check is impossible, say so
  rather than implying success") — KEEP. This shapes *reporting*, not verification behaviour, and is
  model-generation-independent.

Replacement text:

> Never claim a result you did not observe. When a check ran, quote its actual output line; if no
> check could run in this environment, say so explicitly rather than implying success.

DELETE the red→green paragraph from the global file — the `test-driven-development` skill owns that
process. Fix the now-dangling pointer at `~/Work/Git/CLAUDE.md:45` ("per global AGENTS.md") to cite
the skill instead.

### Split the uncommitted Sol/Fable section

- ¶1 (name disambiguation, dated 2026-07-28) — **KEEP global.** User vocabulary; could be uttered anywhere.
- ¶2 (pair them on different tasks) — **MOVE** to `~/Work/Git/CLAUDE.md` beside the existing
  cross-provider review policy.
- ¶3 (codex-review plugin internals: 3-round cap, never show self-assessment) — **DELETE**; it
  restates `codex-plan-review/SKILL.md:10,17`. Keep only the non-obvious residue: "for longer
  convergence loops, drive `codex exec` directly."

### Explicitly surviving (do not touch)

Every dated-incident rule: `--admin` bypass ban (2026-07-16), explicit staging / never `commit -a`
(2026-07-09), merge-commit default, memory two-store routing (2026-07-20), when-corrected-update-this-file.
Plus context hygiene, rule 1's ask-at-most-one-question, and rule 4's pushback discipline
("Pushback alone is not evidence") — that last one resists sycophancy, which the shipped
self-correction block does *not* cover.

**"A reported finding is a hypothesis — verify it against HEAD"** survives explicitly. It reads like
verification scaffolding but is not: it governs trust in *external* claims, not self-checking. This
session proved it twice — Fable's chezmoi-template mechanism was wrong, and five of its findings
needed a HEAD check before I would repeat them.

---

## Phase 2 — `~/Work/Git/CLAUDE.md`: make escalation a mechanism

Sol's central objection: *"'Escalate high-reasoning work' is not a mechanism. It is a label applied
after difficulty becomes visible."* Fix that by freezing observable triggers **before** the eval runs,
so the escalation arm can be scored honestly.

Draft trigger list (escalate to Fable when *any* fires):

1. Two failed attempts at the same acceptance test
2. Competing architectural approaches with irreversible consequences
3. Security, data-loss, or production-migration risk
4. Evidence spanning several repos or an unfamiliar system
5. Adversarial review *after* an implementation is complete

Note trigger 5 separately: Sol argued Fable may be worth more as planner/reviewer than as
implementer, and that conflating the two means crediting "a second pass" to "a better model." The
published benchmarks (Phase 5) corroborate this — Fable's separation from Opus 5 appears on
long-horizon and frontier work, not on SWE-bench implementation. So write the triggers to route
Fable into **planning and adversarial review**, not into taking over implementation.

Because effort changes invalidate the prompt cache mid-conversation, escalation means **starting a
new session or subagent at the higher tier**, not raising effort in place. Write it that way.

Also fix here:
- The red→green pointer (Phase 1).
- Land Sol/Fable ¶2.
- Leave the model-tiering rule alone. It is *more* load-bearing under Opus 5, which reaches for
  subagents freely — the cap direction at line 26 is already correct.

---

## Phase 3 — Skills de-prescribing

Anthropic: over-prescriptive prompts written for prior models **reduce** Fable 5's output quality.
The corpus contains its own governing rule — `writing-skills/SKILL.md:580`: *"Always include a
no-guidance control. If the control doesn't exhibit the failure, there is nothing to fix — stop."*

**Method: re-run each bulletproofing block's baseline scenario against Opus 5 with the skill removed.
Every block whose no-skill control no longer fails gets deleted under the skill system's own Iron Law.**
This is not a judgement call; it is the skill library's stated test applied to a new model.

Ranked targets:

1. `writing-skills` (689 lines) — `:629` todo-per-checklist-item mandate (~25 todos), `:616`
   "you MUST STOP", `:382` "Delete it. Start over", the 8-row excuse table. Its newer sections
   (Match the Form to the Failure, Micro-Test Wording) are current best practice and stay.
2. `test-driven-development` (379) — `:37-45` delete-and-start-over with "No exceptions", the 11-row
   rationalization table, the 13-item red-flags list. On a literal instruction-follower, "delete N
   hours of work" applied mechanically is destructive rather than disciplined. The seams section and
   test-first principle survive.
3. `systematic-debugging` (313) — `:48` mandatory phase gating. The red-capable-loop ladder and the
   3-failures→question-architecture tripwire survive as goals + constraints without the phase shell.
4. `brainstorming` (181) — `:3` description says "You MUST use this before any creative work" while
   `:18` says skip trivial work. Rewrite the description to encode the gate. Delete the 9-todo mandate at `:32`.
5. `adversarial-agents` `:58` — `model=haiku` for adversarial critique contradicts
   `~/Work/Git/CLAUDE.md:23` ("Haiku misses subtle cross-source contradictions; don't use it for
   judgment"). Change to sonnet, or document a validated exception.

`writing-plans` stays prescriptive by design — its audience is cold-start SDD implementers, not the
frontier controller. House style to imitate: `docs-consolidate` (every rule carries its reason) and
`using-skills` (20 lines, refuses to duplicate global CLAUDE.md).

---

## Phase 4 — The 8 active repos

transcoder, brok-stacks, unifi, skopia-app, session-retro, jasonmatthew.dev, jasonm4130-cf,
continual-learning.

Known: **skopia-app** is the one bad citizen — `CLAUDE.md:45,66` duplicate the global Karpathy
defaults and verification section, and the copy has already drifted (missing rule 1's
ask-at-most-one-question and rule 4's pushback clauses). Delete both; fold its two genuinely
repo-specific lines into its engineering-conventions section.

Spot-checked clean: brok-stacks, transcoder, jasonmatthew.dev. `transcoder/CLAUDE.md` is the
exemplar — dense repo facts where every "do not fix this" carries its incident reason.

Carve-out, do not delete: `brok-stacks/CLAUDE.md:330` ("never report complete without running
`docker compose config`") is external validation for infra files with no test suite, not
self-verification scaffolding. Same for `subagent-driven-development/SKILL.md:150-167`, which checks
*another agent's* claims in a sandbox that structurally cannot capture exit codes.

---

## Phase 5 — Effort sweep (revised: benchmarks settled the model question)

### What published data already settles — no eval needed

Third-party aggregation of the published scores:

| Benchmark | Opus 5 | Fable 5 |
|---|---|---|
| SWE-bench Verified | 96.0% | ~95% |
| SWE-bench Pro | 79.2% | 80.0% |
| Terminal-Bench 2.1 | — | 88.0% |
| FrontierCode Diamond | — | 29.3% (Opus 4.8: 13.4%) |

**Conclusion: drop the Fable implementation arms.** A 0.8-point SWE-bench Pro edge at 2× price and
materially higher latency does not justify a routine escalation ladder for coding, and Opus 5 leads
on Verified outright. Fable's separation appears on long-horizon (Terminal-Bench) and frontier
(FrontierCode) work — which is the planner / adversarial-reviewer role, not the implementer role.
That matches Sol's argument and the existing `~/Work/Git/CLAUDE.md:37` policy. Keep the Phase 2
trigger list; it now routes to Fable for *planning and review*, not for taking over implementation.

Caveat to record: these are third-party aggregations at unspecified (likely `max`/`xhigh`) effort.
Treat the ranking as sound and the decimal places as soft.

### What published data cannot settle — hence the sweep

No public per-effort-level benchmark table exists. Anthropic publishes effort-vs-performance curves
on internal evals only, and states directly: *"If you carried effort settings over from an earlier
model, run a fresh effort sweep on your evals rather than reusing them."* `settings.json:198` is
`xhigh` — carried over from the Opus 4.7/4.8 era, whose guidance was "start at xhigh for coding."
Opus 5's guidance is different: **start at `high` (the default)**, step up to `xhigh` only for
demanding agentic work, and *"use `low` and `medium` liberally as your primary control for token
cost and response time wherever your evals show quality holds."*

### Revised design — cheap, no frozen harness

- **3 arms:** Opus 5 `low`, `medium`, `high`. No Fable arms, no frozen task set, no blind scorer.
- **Run on real work** in the 8 active repos, one arm per session, effort held constant for the
  whole session (see caching note below).
- **Record per session:** wall-clock to accepted change, correction turns needed, tool-call count,
  whether the result was accepted first pass.
- **Decide when a pattern is obvious**, not at a fixed n. This yields an operating default with
  named exceptions, which is all a personal sample can support. It is explicitly *not* a
  statistically defensible measurement, and should never be reported as one.

Objective function, so "sweet spot" means something: **minimize elapsed time and your attention per
accepted change, subject to a defect-rate ceiling.** Flat-rate billing removes token price, not scarcity.

### Two operational facts that shape the policy

1. **Low effort changes agentic behaviour, not just depth.** Per the effort docs, low effort
   *"combines multiple operations into fewer tool calls… proceeds directly to action without
   preamble… uses terse confirmation messages"*; high effort *"makes more tool calls… explains the
   plan before taking action."* This is why the low-for-implementation intuition is sound where the
   plan is already settled — the preamble is overhead once the decision is made. It also predicts
   where low will fail: work where exploration *is* the task.
2. **Mid-session escalation is not free.** *"Changing the effort value between requests invalidates
   prompt caching… pick an effort level at the start and keep it constant."* So the policy should be
   *per-session effort choice*, not dynamic escalation within a session. Escalation means starting a
   new session (or a subagent) at the higher tier.

Also from the docs, directly supporting the existing tiering rule: `low` is listed as suitable for
*"subagents"* — so delegated mechanical work should carry `low`, not just a cheaper model.

---

## Phase 6 — Recurrence

Sol: *"Do not automate a recurring full sweep… Most weeks contain no relevant event, so it trains
Jason to ignore the system."* It reads the graphify deletion as a system that scheduled substantive
work regardless of need. Matches the chosen option.

Machine-readable marker at the top of `AGENTS.md`, replacing the current prose cadence line:

```yaml
tuned_for: opus-5
review_after: 2027-01-28
last_checked: 2026-07-28
```

`session-start.sh` checks the date and emits **one** nudge when overdue, with an acknowledgement
stored so it does not repeat every session. The review itself stays manually invoked. No background
job, nothing to forget, same mechanism you already trust for the active-plans nudge.

Deliberately **not** building: model-release detection. Sol is right that no cheap signal reliably
covers announcement + Claude Code availability + changed prompting guidance simultaneously, and a
scraper that fires on the wrong signal is the failure mode that got graphify deleted. The date
backstop plus your own awareness of a model launch is sufficient.

Note that `AGENTS.md:8` already said *"re-validate on every major model family upgrade"* — Opus 5 **is**
that upgrade, so the file's own terms mandated this sweep ahead of its 2026-11-16 date. The marker
just makes that machine-checkable.

---

## Sequencing

Phase 0 gates Phase 1. Phases 2–4 are independent once 1 lands. Phase 6 is independent throughout.

Phase 5 must come **last**: it now runs on real work over time rather than a frozen task set, so any
config change landing mid-sweep contaminates it. Get 0–4 and 6 done, let the config settle, then
start recording.

Order: 0 → 1 → 2 → 6 → 4 → 3 → 5.

## Follow-up

`feedback_quality_over_cost.md` in project memory currently reads *"keep Opus + xhigh… Don't suggest
Sonnet/effort downgrades."* Whatever Phase 5 concludes, that memory needs rewriting — as it stands it
will fight the outcome of this work.
