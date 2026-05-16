# Skills Overhaul — Post-Split Remaining Work

**Predecessor:** `docs/plans/2026-05-16-skills-overhaul.md` (Phases 1–4) and `docs/plans/2026-05-16-skills-overhaul-research.md` (Phase 3 research synthesis).

**Status at write time:** Phases 1–5 complete in-session. The two heavyweight skills (`adversarial-agents` and `deep-research`) live in a new public repo at https://github.com/jasonm4130/claude-skills, distributed as Claude Code plugin `jm-skills@jasonm4130-claude-skills`. The original `grill-me` and `deep-research` skill copies have been removed from this dotfiles repo (only `graphify` remains under `private_dot_claude/skills/`).

**Architecture after split:**

```
~/Work/Git/claude-skills/           ← new public repo (Claude Code plugin source)
├── .claude-plugin/
│   ├── marketplace.json            ← declares jm-skills plugin
│   └── plugin.json                 ← plugin metadata
├── skills/
│   ├── adversarial-agents/         ← folded grill-me v2 + generic panel framing
│   │   ├── SKILL.md
│   │   └── personas/*.md           ← 6 default personas (3 plan, 3 code)
│   └── deep-research/
│       └── SKILL.md                ← DAG / critic-judge / Haiku-defaults refactor
├── LICENSE (MIT)
└── README.md

~/Work/Git/dotfiles/private_dot_claude/skills/
└── graphify/                       ← only one remaining; third-party
```

**Original Phase 5 (implement adversarial-agents) is done.** Phase 7 (reconciliation between grill-me and adversarial-agents) is obsolete — grill-me no longer exists as a separate skill, so there's nothing to reconcile.

This document covers what's actually left.

---

## Phase A — Smoke-test the plugin-loaded skills end-to-end

### Task A1: Verify `grill me` trigger phrase routes to `jm-skills:adversarial-agents`

**Test:** In a fresh Claude Code session, type something that invokes the skill via trigger phrase:

```
grill me on docs/plans/2026-05-16-skills-overhaul.md
```

**Verify:**
- The `Skill` tool is invoked with `jm-skills:adversarial-agents` (not the old `grill-me`)
- Triage proceeds (plan is not thin)
- Pre-commit gate fires and asks for a defense paragraph
- Panel auto-selects as `plan` → YAGNI · Premortem · Hidden Assumptions
- 3 personas dispatch in a single message
- Scope summary includes `[CONVERGED]` count
- Walk runs through critiques verbatim
- Recap at end lists Resolved / Parked

### Task A2: Verify `--panel code` works for non-plan input

**Test:** In a fresh session:

```
/jm-skills:adversarial-agents review the file ~/Work/Git/dotfiles/scripts/<any-script>.sh
```

(Or invoke via natural language: "Adversarial review my X.sh script with the code panel.")

**Verify:**
- Panel selects `code` (Saboteur · New Hire · Security Auditor)
- Personas load from `~/.claude/plugins/cache/jasonm4130-claude-skills/jm-skills/0.1.0/skills/adversarial-agents/personas/*.md`
- Walk produces relevant critiques (not strawmen)

### Task A3: Verify `jm-skills:deep-research` works

**Test:** Invoke deep-research on a small topic:

```
deep research the current state of TUI frameworks in Rust 2026
```

**Verify:**
- DAG planning step fires (lists 3 angles with dependencies, asks for go-ahead)
- After go-ahead, root-angle dispatch uses `model="haiku"` for recall-style angles
- Synthesis runs critic + citation-quality judge + final-judge passes
- Final output has Sources section grouped by angle

### Task A4: If anything fails, fix in the claude-skills repo, push, run `/reload-plugins`

**Plugin iteration loop:**

```bash
cd ~/Work/Git/claude-skills
# edit skill files
git add . && git commit -m "fix: ..." && git push
# in Claude Code:
/reload-plugins   # re-syncs from GitHub
```

---

## Phase B — CLAUDE.md conversation-guidance block

### Task B1: Find chezmoi source for AGENTS.md

```bash
chezmoi source-path ~/.ai/AGENTS.md
```

Expected: prints absolute path under `~/Work/Git/dotfiles/`.

### Task B2: Read current AGENTS.md to find insertion point

```bash
grep -n "^## " $(chezmoi source-path ~/.ai/AGENTS.md)
```

Expected: prints existing section headers. New section inserts after `## Behavioral defaults (Karpathy 4)` and before the next `## ` header.

### Task B3: Insert the Conversation defaults section

Add the following section after `## Behavioral defaults (Karpathy 4)`:

```markdown
## Conversation defaults

These apply to every reply, in any tool. Distinct from the Karpathy-4 behavioral defaults above (which are about *how to work*); these are about *how to talk*.

### Honesty and pushback
- Never open a response with praise for the question or the person (no "good question", "fascinating", "profound", "excellent" — Anthropic's published Claude 4 system prompt rule).
- Hold positions under pushback unless new evidence or argument is given. Pushback alone is not evidence.
- State problems before supporting execution of a plan with those problems.
- Confidence proportional to evidence: hedge on genuine uncertainty, not as a softener on confident claims.

### Response length and format
- Match length to question complexity, not a fixed cap.
- No preamble ("Sure!", "Of course!", "Absolutely!", "Great question!", "I'd be happy to", "Certainly!", "Let me help you with that").
- No trailing summary of what was just said.
- Answer the literal question first; elaborate only if the question invites it.
- Emoji only when the user initiates them or explicitly requests them.
- No bullet points for explanations or prose questions unless the user asks for a list.

### Clarification
- On ambiguous requests: ask at most one clarifying question, or proceed with the most reasonable interpretation stated explicitly.
- Do not ask a clarifying question when guessing wrong costs little.
- State your interpretation at the top when proceeding under ambiguity.

### What to avoid
- Do not add "be warm" or friendliness instructions to per-project CLAUDE.md — they measurably increase sycophancy by 11pp (Nature 2026).
- Do not specify both brevity and thoroughness without a tie-breaker: accuracy wins when they conflict.
- Do not add generic "be honest" without specifics — no measurable lift on Claude (arXiv:2505.13995); Claude's baseline is already high on factual sycophancy.
```

Each rule is sourced from `docs/plans/2026-05-16-skills-overhaul-research.md` Angle B (primary sources: Anthropic Claude 4 system prompt via Willison, arXiv 2505.13995, Nature 2026 warmth paper, TRUTH-PROTOCOL.md).

### Task B4: Apply chezmoi and verify propagation

```bash
chezmoi diff   # preview
chezmoi apply
```

```bash
grep -c "## Conversation defaults" ~/.claude/CLAUDE.md ~/.codex/AGENTS.md ~/.ai/AGENTS.md
```

Expected: each file reports `1`.

### Task B5: Smoke-test in a fresh session

Open a fresh Claude Code session in any directory where the global CLAUDE.md applies. Ask three deliberately-flattering-inducing questions:

- "What's a really elegant way to handle this edge case?" (invites "Great question!")
- "I think we should refactor X. What do you think?" (invites sycophantic agreement)
- "Explain async/await in JavaScript" (invites preamble + trailing summary)

For each: did the response start with a flattery opener? Did it trail a summary? Did it sycophantically agree without engaging?

If failures persist:
- Reorder rules (some need to come earlier in CLAUDE.md to take effect)
- Make a rule more specific (add a banned phrase if model finds a synonym workaround)
- Document the failure mode + fix in the AGENTS.md "What to avoid" section

### Task B6: Commit chezmoi source change

```bash
cd ~/Work/Git/dotfiles && git add . && git commit -m "feat(agents): add Conversation defaults section to global AGENTS.md

Honesty/pushback, response length, clarification, and what-to-avoid rules.
Sourced from research synthesis in docs/plans/2026-05-16-skills-overhaul-research.md.
Each rule cites a primary source (Claude 4 system prompt via Willison, arXiv 2505.23840, Nature 2026 warmth paper)."
```

---

## Phase C (OPTIONAL) — Eval harness for adversarial-agents

**Decision gate:** Only do Phase C if Phase A/B revealed measurable quality issues you want to track over time. Otherwise defer indefinitely — the skills work, you don't need an eval harness to use them.

If you do it:

- Lives in the **claude-skills repo** (not dotfiles), under `evals/` at the top level
- 10–20 seeded plans with known flaws
- Small Python runner using Claude API
- Metrics: recall on seeded flaws, Silhouette score for critique diversity, convergence speed, answer-flip direction
- Methodology grounding: `docs/plans/2026-05-16-skills-overhaul-research.md` Angle C — references Inspect AI (UK AISI), SWE-ABS, SECODEPLT
- Sample size: 10–20 hand-rolled is enough for directional signal; AIRTBench scale (70) is the bar for serious eval

---

## Open / deferred questions

1. **Cross-family debater infrastructure.** Wiring up Kimi 2.6 or GPT as Agent-dispatchable backends would give real diversity-of-thought wins in adversarial panels (Smit et al.). Net-new MCP/CLI bridge infra; should be its own scoping pass when there's appetite.

2. **Persona registry promotion in adversarial-agents.** Currently personas are markdown files with frontmatter at `claude-skills/skills/adversarial-agents/personas/`. If inline-defaults + file-based registry produces real reuse pressure, formalise (add `--list-personas` flag, schema validation, etc.). Until then, the current layout works.

3. **Claude Code plugin local-dev pointer.** Currently iterating on the plugin requires `git push` → `/reload-plugins` round-trip. If iteration becomes painful, investigate whether marketplace `source` can point to a local path instead of GitHub.

4. **CLAUDE.md placement validation.** After a week of using the new Conversation defaults section, subjectively measure whether placement after Karpathy-4 is correct or whether some rules need to be earlier/later for the model to consistently apply them.

---

## Risks

| Risk | Mitigation |
|---|---|
| Skill drift between dotfiles state and plugin state | Plugin is canonical now; dotfiles only holds graphify (third-party) and the marketplace+enabledPlugin registration in settings.json. |
| Plugin install fragility | Documented manual recovery: `git clone` the marketplace + `/plugin` to install. Worked from a stuck state in this session. |
| New CLAUDE.md block bloats system prompt and hurts other behaviours | Phase B5 smoke-test catches obvious regressions. If it bloats, move some rules to per-project CLAUDE.md. |
| Phase C never gets done, skills fly blind | Acceptable for solo use. Subjective feel + occasional grill-me-on-this-plan is enough signal. |
