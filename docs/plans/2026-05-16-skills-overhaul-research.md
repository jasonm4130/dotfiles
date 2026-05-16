# Skills Overhaul — Phase 3 Research Synthesis

**Date:** 2026-05-16
**Source plan:** `docs/plans/2026-05-16-skills-overhaul.md` Phase 3 (Tasks 9–10)
**Process:** Refined `deep-research` skill (DAG plan → 3 parallel sub-agents → critic + citation-judge + final-judge passes in this orchestrator session)
**Models used:** Haiku for angles A and C (recall-style), Sonnet for angle B (synthesis-heavy)

---

## Key findings (the things load-bearing for the follow-up plan)

1. **A configurable `adversarial-agents` skill has clear precedent.** zscole/adversarial-spec ships 13 named personas as CLI flags with custom-persona support. alirezarezvani's adversarial-reviewer pioneered the **severity-promotion-on-overlap** rule that we already adopted in grill-me. The generalisation pattern is "input-type detection → panel selection → severity promotion on overlap".

2. **The biggest published anti-sycophancy result is the named-persona Andrew prompt**: arXiv:2505.23840 (May 2025) reports up to **63.8% sycophancy reduction** by assigning a named third-person persona, +28% additional gain from combining with an explicit anti-sycophancy instruction. Strongest single prompting result in the literature.

3. **"Be warm" instructions measurably increase sycophancy by 11pp** (Nature 2026, peer-reviewed). This is the most important *negative* finding for CLAUDE.md — don't add warmth instructions to a global system prompt.

4. **Claude 4's published system prompt** (via Simon Willison, May 2025) contains the canonical phrasing for anti-flattery: *"Claude never starts its response by saying a question or idea or observation was good, great, fascinating, profound, excellent, or any other positive adjective."* Verbatim, Anthropic-authored, drop-in usable.

5. **"Direct mitigation" anti-sycophancy phrase works on GPT-4o but NOT on Claude/Gemini** in arXiv:2505.13995 — Claude's baseline resistance to factual sycophancy is already high (SYSCONBENCH Dec 2025: 0% drift on factual, 25.9% on value/opinion). Implication: anti-sycophancy phrasing in CLAUDE.md will have marginal lift on factual answers; the leverage is on value/opinion categories.

6. **The position-holding rule has community-tested verbatim phrasing**: *"No position changes without new evidence. If you push back without providing new information, [model] maintains its position. Pushback is not evidence."* (TRUTH-PROTOCOL.md, Mar 2026). High-leverage addition.

7. **Inspect AI (UK AI Safety Institute) is the evaluation harness to build on**. Shipped, open-source, with 60+ evals in `UKGovernmentBEIS/inspect_evals`. Has solvers/scorers/multi-agent primitives. AIRTBench in particular: 70 CTF challenges for autonomous red-teaming — Claude-3.7-Sonnet hits 61%. That's the right scale for a small seeded-flaws benchmark.

8. **Diversity-of-critique is the underexplored metric.** None of the 2025–26 major papers publish embedding-distance or overlap metrics for distinct persona critiques. SWE-ABS measures convergence speed but not orthogonality. Opportunity to innovate for `adversarial-agents`.

9. **Voice consistency across sub-agents is partially solved by Claude Code's architecture**: jannesklaas.github.io (Jul 2025, analysing Claude Code internals) reports sub-agents receive the *identical* parent system prompt — they aren't even told they're sub-agents. So the voice anchor IS your global CLAUDE.md, automatically inherited. This makes the "claude-voice as separate skill" idea redundant for Claude Code specifically; voice work belongs in CLAUDE.md additions.

---

## Details by angle

### Angle A — Generic configurable adversarial-agents skill

**Persona library design — three-tier pattern:**

| Tier | Source | What it gives |
|---|---|---|
| Inline personas in SKILL.md | mattpocock/grill-me, alirezarezvani/adversarial-reviewer | Fast, no infra; rigid |
| Named persona registry (`personas.yaml`) | zscole/adversarial-spec (13 named CLI roles) | Reuse, composability; YAML maintenance |
| Custom personas at runtime | zscole `--persona "..."` | One-off ad-hoc roles; no reuse |

A generic skill should support all three: defaults inline, registry optional, runtime override always.

**Panel selection by artefact type — production-observed mapping:**

| Input | Auto-selected panel | Source pattern |
|---|---|---|
| Code (diff/file) | Saboteur · New Hire · Security Auditor | alirezarezvani/adversarial-reviewer |
| Plan / design doc | YAGNI · Premortem · Hidden Assumptions | mattpocock/grill-me (now our grill-me v2) |
| Product spec / PRD | Domain expert · Edge-cases · Cost/feasibility | zscole/adversarial-spec |
| Prose / writing | Clarity · Hostile Reader · Devil's Advocate | Practitioner consensus (no single source) |
| Model output | Fact-checker · Omission detector · Bias auditor | Practitioner consensus (no single source) |

The bottom two are extrapolated patterns, not citations. Treat as "reasonable defaults to validate" rather than evidence-backed.

**Reusable patterns to keep from grill-me v2:**
- Pre-commitment gate (sycophancy defense — Pocock, obra, fullo lineage)
- Shared adversary contract (mandatory ≥1 finding, named anti-rationalization failure modes)
- `[CONVERGED]` severity promotion on overlap (alirezarezvani published rule)
- Verbatim-substance standing rule (Wynn et al. ICML 2025 capability-asymmetry defense)
- Dog-with-bone walk with cap 3 (Khan et al. ICLR 2025; HAJailBench)

**Configuration surface (concrete proposal extending zscole):**

```bash
/adversarial-agents [file-or-text]
  --panel code|plan|prose|spec|model-output|custom
  --personas saboteur,new_hire,security_auditor   # override panel
  --converged-threshold 2
  --max-personas 5
  --severity-promotion on|off
  --output block|concerns|clean|detailed
```

---

### Angle B — Concrete CLAUDE.md / AGENTS.md additions

**Verbatim drop-in block (synthesised from Anthropic Claude 4 system prompt + community-tested patterns + research-flagged backfires):**

```markdown
## Honesty and pushback
- Never open a response with praise for the question or the person (no "good question", "fascinating", "profound", "excellent" — Claude 4 system prompt rule).
- Hold positions under pushback unless new evidence or argument is given. Pushback alone is not evidence.
- State problems before supporting execution of a plan with those problems.
- Confidence proportional to evidence: hedge on genuine uncertainty, not as a softener on confident claims.

## Response length and format
- Match length to question complexity, not a fixed cap.
- No preamble ("Sure!", "Of course!", "Absolutely!", "Great question!", "I'd be happy to", "Certainly!", "Let me help you with that").
- No trailing summary of what was just said.
- Answer the literal question first; elaborate only if the question invites it.
- Emoji only when the user initiates them or explicitly requests them.
- No bullet points for explanations or prose questions unless the user asks for a list.

## Clarification
- On ambiguous requests: ask at most one clarifying question, or proceed with the most reasonable interpretation stated explicitly.
- Do not ask a clarifying question when guessing wrong costs little.
- State your interpretation at the top when proceeding under ambiguity.

## What to avoid
- Do not add "be warm" or friendliness instructions — they measurably increase sycophancy by 11pp (Nature 2026).
- Do not add generic "be honest" without specifics — no measurable lift on Claude (arXiv:2505.13995); Claude's baseline is already high on factual sycophancy.
- Do not specify both brevity and thoroughness without a tie-breaker: accuracy wins when they conflict.
```

**Cross-model transferability — portable core vs model-specific:**

| Rule | Claude | GPT | Gemini |
|---|---|---|---|
| No preamble / no flattery | ✅ | ✅ | ✅ |
| Direct advice / criticism phrase | Marginal | +4% measured | Marginal |
| Position-holding rule | Effective | Effective | Untested |
| Adaptive brevity (not hard caps) | ✅ | ✅ | Needs "no inference of unprovided context" |
| One-question clarification | ✅ | ✅ | Needs "do not guess" explicit |
| XML tags for structure | Native | ✅ | ✅ if no markdown wrap |

**The portable core for all three:** anti-flattery, brevity-adaptive, one-question clarification, position-holding.

**Backfires explicitly flagged (do NOT add to CLAUDE.md):**
- Warmth instructions → +11pp sycophancy (Nature 2026)
- Generic "be honest" → no measurable lift on Claude (arXiv:2505.13995)
- Hard brevity + thoroughness without tie-breaker → arbitrary resolution
- "Be assertive" / "take firm stance" without calibration grounding → miscalibration

---

### Angle C — Evaluation harness for adversarial / interview skills

**Three measurement pillars:**

1. **Seeded-flaw benchmarks** — plant N known bugs, measure recall per persona.
   - SWE-ABS methodology (arXiv 2603.00520, 2026): two-stage augmentation (coverage-driven + mutation-driven). Top SWE-Bench score dropped 78.80% → 62.20%, revealing 19.78% false-passes.
   - SECODEPLT (NeurIPS 2025, github.com/ucsb-mlsec/SeCodePLT): 5.9k samples, 44 CWE categories, code available. Key metric: **recall degradation at higher bug density** (models finding 90% of 1 bug collapse to 30–40% at 9 bugs).
   - Target scale for our skill: 10–20 seeded plans, not 5.9k.

2. **Sycophancy / convergence metrics** — measure debate collapse to agreement.
   - "Peacemaker or Troublemaker" (arXiv 2509.23055): disagreement-rate per round (ideally stable; fast decay to 0% = sycophancy), accuracy trajectory (correct→incorrect drift after consensus), confidence mimicry (token-level confidence convergence). Reports 10–30% accuracy drop vs single-agent baseline when sycophancy fires.
   - **Attribution note:** This paper's attribution is inconsistent across sources I saw — cited variously as "AWS AI Labs / ICLR 2025" (Angle C) and "Yao et al. ICLR 2026 sub." (earlier wave-1 research). Likely same paper at different stages, but verify before citing in skill docs.

3. **Production harness — use Inspect AI** (UK AI Safety Institute).
   - URL: https://inspect.aisi.org.uk/
   - Eval suite: `github.com/UKGovernmentBEIS/inspect_evals` (483 stars, 60+ shipped evals)
   - Has solvers, scorers (incl. LLM-as-judge with mandatory meta-validation), multi-agent primitives (ReAct, deep agent, handoff).
   - AIRTBench: 70 CTF challenges for red-teaming — Claude 3.7 Sonnet hits 61%.

**Diversity-of-critique metric — opportunity to innovate.** No published work on embedding-distance between persona critiques. Baseline approach (untested but cheap):
- Embed each critique with sentence-transformers
- Compute pairwise cosine distance between critiques
- Cluster; report Silhouette coefficient (0–1, higher = personas surface distinct concerns)
- Flag "one critic in two costumes" when Silhouette < 0.3

**Implementation spec for grill-me / adversarial-agents eval (minimum viable):**

```
Inputs: 10 seeded plans, each with 3–5 known flaws of varied severity
Metrics:
  - Recall: % of seeded flaws caught (per persona, aggregate)
  - Precision: % of surfaced critiques that map to seeded flaws (vs noise)
  - Convergence speed: rounds-to-agreement; flag <2 rounds as pathological
  - Answer-flip direction: count correct→incorrect vs incorrect→correct flips
  - Critique overlap: Silhouette score of critique embeddings per run
Sample size: 10–20 plans for hand-rolled benchmark; AIRTBench scale (70) for serious eval
```

---

## Contradictions surfaced

1. **"Peacemaker or Troublemaker" attribution** — Angle C says AWS AI Labs / ICLR 2025; wave-1 said Yao et al. ICLR 2026 sub. Worth resolving before citing in skill docs. Likely same paper, multiple submissions.

2. **Anti-sycophancy prompt effectiveness on Claude** — arXiv:2505.13995 says "no prompting strategy outperformed base model" on Claude for social sycophancy. arXiv:2505.23840 says named-persona prompting achieves 63.8% reduction. Reconcilable: the latter is debate-setting sycophancy, the former is factual; Claude's baseline is high on factual, lower on debate/value categories. The skill recommendations should reflect this — most leverage on value/opinion answers, not factual.

3. **DRY vs inline personas.** Angle A's three-tier recommendation conflicts with grill-me v2's deliberate choice to lift the shared contract to a "Shared adversary contract" block (DRY). For `adversarial-agents`, we should pick a side: either inline-with-shared-block (grill-me pattern) or full registry. Recommendation: start with the grill-me pattern and graduate to a registry only if the cost of YAML maintenance is justified by reuse volume.

---

## Open questions (for follow-up plan to address)

1. **Should `adversarial-agents` supersede `grill-me` or coexist?** Grill-me is specialised (plan-only, 3 fixed personas). Adversarial-agents is generic. Two clean options: (a) deprecate grill-me, redirect to `adversarial-agents --panel plan`; (b) keep grill-me as the well-trodden "plan" entry point that internally delegates. Decision: (b) — keeps the grill-me trigger phrases working, lets adversarial-agents be the abstract primitive.

2. **Persona registry format.** YAML vs Markdown-with-frontmatter vs JSON. zscole uses Python module imports. For a Claude Code skill, Markdown with frontmatter matches the existing skill ecosystem.

3. **CLAUDE.md placement of new block.** Top (always-visible), bottom (least disrupts existing structure), dedicated section. Affects discoverability and override semantics.

4. **Eval harness scope.** Standalone repo? Skill-internal `evals/` dir? Inspect AI integration? Realistically: skill-internal seeded-flaws JSON + a small Python runner; Inspect AI integration as v2.

5. **Cross-family debater infra.** Still unresolved from prior session. Worth a separate scoping pass if cross-family diversity becomes a priority.

---

## Sources (grouped by angle)

### Angle A — Adversarial-agents skill design
- `github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md` — Pocock's grill-me (original)
- `github.com/alirezarezvani/claude-skills/blob/main/engineering-team/adversarial-reviewer/SKILL.md` — Saboteur/New Hire/Security Auditor + severity-promotion rule
- `github.com/zscole/adversarial-spec` — 13 named personas as CLI flags, multi-model debate
- `github.com/Jekudy/grillme-skill` — wave-structure variant of grill-me
- `github.com/RobMitt/grill-me-skill` — fork variant

### Angle B — CLAUDE.md / AGENTS.md additions
- `simonwillison.net/2025/May/25/claude-4-system-prompt/` — "Highlights from the Claude 4 system prompt" (May 2025) — primary source for verbatim Anthropic phrasing
- `arxiv.org/html/2505.13995v1` — "Social Sycophancy: A Broader Understanding of LLM Sycophancy" (May 2025) — direct-mitigation phrase tested cross-model
- `arxiv.org/pdf/2505.23840v3` — Persona-based anti-sycophancy ("Andrew" prompt, 63.8% reduction) (May 2025)
- `arxiv.org/pdf/2510.16727` — Model-specific sycophancy preambles (Oct 2025)
- `nature.com/articles/s41586-026-10410-0` — "Training language models to be warm can reduce accuracy" (Nature 2026) — +11pp sycophancy from warmth training
- `github.com/chewyuenrachael/claude-sycophancy-eval` — SYSCONBENCH (Dec 2025) — 0% factual drift, 25.9% value drift
- `github.com/LivingFramework/LivingFramework.github.io/blob/main/TRUTH-PROTOCOL.md` — verbatim position-holding rule (Mar 2026)
- `github.com/langgptai/awesome-claude-prompts` — production system prompts incl. brevity rules
- `contextpatterns.com/guides/system-prompt-engineering` — practitioner consensus on tie-breakers
- `jannesklaas.github.io/ai/2025/07/20/claude-code-agent-design.html` — Claude Code sub-agent inheritance (Jul 2025)

### Angle C — Evaluation harness
- `arxiv.org/pdf/2603.00520v1` — SWE-ABS adversarial benchmark strengthening (2026)
- `github.com/ucsb-mlsec/SeCodePLT` — SECODEPLT, 5.9k samples, 44 CWE categories (NeurIPS 2025)
- `arxiv.org/html/2509.23055v1` — "Peacemaker or Troublemaker" (attribution flagged; verify before citing)
- `inspect.aisi.org.uk/` — Inspect AI framework (UK AISI, shipped)
- `github.com/UKGovernmentBEIS/inspect_evals` — 60+ evals incl. AIRTBench (483 stars)
- `proceedings.iclr.cc/paper_files/paper/2025/file/07be1a0850e58ca29e2b6ce31fc0c791-Paper-Conference.pdf` — MM-SY vision-language sycophancy

---

**Single-perspective check:** No domain has ≥3 findings from a single source. Anthropic + arXiv + Nature + GitHub + AISI + practitioner blogs all contribute. Diversity is healthy.

**Limitation:** No cross-family judge was used (research used Claude sub-agents only). Per the refined deep-research skill's documented limitation, in-family judges show ~70% positional bias in published evals. Future research on these topics would benefit from a cross-family judge if/when MCP/CLI bridge infra is wired up.
