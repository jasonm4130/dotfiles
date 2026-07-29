# Opus 5 output verbosity

**Date:** 2026-07-29
**Method:** `deep-dive` fan-out, 5 angles (3 core, 1 background, 1 dependent), Sonnet workers at
medium effort, factored tier-1 verification per angle. 0 angles failed. Reliability: a1/a2 high,
a3/a4/a5 medium.
**Question:** is Opus 5's longer output a real characteristic, what drives it, and which prompt
levers actually reduce it — grounding a reconciliation pass on `dot_ai/AGENTS.md`.

---

## 1. It is documented, and it is not a local misconfiguration

Anthropic names longer output as a behaviour change from Opus 4.8, in two separate places.

`whats-new-opus-5`, under "Model behavior differences":

> Default user-facing responses and written deliverables run longer. In agentic sessions, the model
> narrates its progress to the user more often. In multi-agent frameworks, it delegates to subagents
> more readily. It also verifies its own work without being told to.

`prompting-claude-opus-5`, under "Response length and verbosity":

> Claude Opus 5's default user-facing responses run longer than prior Opus models'. The effort
> parameter controls how much the model thinks rather than how much it says: lowering effort can
> reduce thinking volume without reliably shortening the visible response. To control response
> length, prompt for it explicitly.

`claude-prompting-best-practices` singles Opus 5 out against the rest of its own family. The page
describes the Claude 5 models generally as having "a more concise and natural communication style…
May skip detailed summaries for efficiency unless prompted otherwise", then immediately:

> Claude Opus 5 is an exception on verbosity: its default user-facing responses run longer than prior
> models', and raising or lowering effort does not reliably change visible response length. Prompt
> explicitly for conciseness instead.

## 2. Effort is not the lever

This kills the obvious fix. `effortLevel` governs thinking depth, tool-call count and preamble; it
does not reliably govern visible response length. Two independent lines of evidence:

- Anthropic's own effort doc: effort "affects all tokens in the response" and lower levels "proceed
  directly to action without preamble", but the Opus 5 pages above explicitly carve response length
  out as not reliably controlled by it.
- CodeRabbit's code-review benchmark found the relationship is not even monotonic: *"High wrote less
  than junior/default, while x-high increased both thinking and output."*

Practical consequence for this repo: the `xhigh → high` change in 69180be (2026-07-28) was correctly
reasoned for its own purpose and is a no-op for verbosity. Do not reach for effort again to fix length.

## 3. Three axes, separately documented and separately mitigated

| Axis | Anthropic's description | Lever |
|---|---|---|
| Conversational prose | "default user-facing responses run longer" | explicit conciseness instruction |
| Agentic narration | "it tends to announce what it is about to do… per-message output in agentic sessions is often longer" | explicit guidance on communication cadence |
| Written deliverables | "files that Claude Opus 5 writes to disk (reports, Markdown documents, summaries) are often longer than on prior models" | explicit length calibration |

The third axis is the one this repo had no coverage for in either render, and it is the one that bites
hardest here given how much of the workflow output is plans, ADRs, specs and research docs. Anthropic's
recommended wording:

> Match the length of written documents to what the task needs: cover the substance, but do not pad
> with filler sections, redundant summaries, or boilerplate.

## 4. The 2026-07-28 fence rested on an assumption that is now false

`dot_ai/AGENTS.md` fenced the `Length is selection, not compression` directive `codex-only` on
2026-07-28, justified as *"Claude Code's own system prompt now ships equivalents of the following."*

Public captures do document an aggressive brevity block in the shipped Claude Code system prompt —
`"You MUST answer concisely with fewer than 4 lines"`, `"You should minimize output tokens as much as
possible"`, `"NOT answer with unnecessary preamble or postamble"`. But those captures are **v1.0.85 and
v1.0.125**.

Direct observation on Claude Code **2.1.220 with Opus 5**: the live system prompt contains **no length
or brevity directive at all**. The nearest thing is an anti-narration line — *"When you have enough
information to act, act… do not narrate options you will not pursue"* — which is not length calibration.
This corroborates a secondhand practitioner report that the Claude Code system prompt was heavily
trimmed for Opus 5 (reported as ~80% deleted; treat the figure as unverified, the direction as confirmed
by observation).

Fence audit against 2.1.220:

| Fenced bullet | Shipped equivalent? |
|---|---|
| Match existing style | **Yes** — "Write code that reads like the surrounding code: match its comment density, naming, and idiom" |
| Finish the whole task | **Yes** — the "Delivering work" block states it near-verbatim |
| Banned openers (enumeration) | No visible equivalent; rule 2 carries the directive unfenced, so only the list is fenced. Acceptable. |
| **Length is selection** | **No. Nothing.** |

Two of four correct, one acceptable, one wrong — and the wrong one is the axis being felt. Note also
that Anthropic writes its Opus 5 conciseness guidance *knowing* what ships in its own harness, and still
says to prompt explicitly. "The system prompt covers it" was never going to be sufficient.

## 5. The existing wording is already the evidence-backed shape

Poddar et al., *Brevity is the soul of sustainability* (ACL Findings 2025), across 12 models and 5
datasets:

- Core answer content averages only ~42% of total response tokens.
- The `MINANS` prose directive ("provide only the minimal answer") cut length ~60% and produced the
  **largest ROUGE-L F1 improvement of any strategy tested** — quality rose, driven by precision with
  only marginal recall loss. A plain "Answer briefly" achieved ~38% reduction, also with improved quality.
- Few-shot length examples were ineffective or **increased** length: "some models fail to understand
  the desired output length from examples."
- Rigid numeric word/token budgets caused "unnecessary cuts", stripping explanatory content alongside
  filler, because a hard target removes the model's discretion about *what* to trim.

The directive already in the file — *"Prefer this to fixed line-counts, which models obey unreliably"* —
is exactly this result. The `at most 150 words` style circulating in practitioner blog posts is the
shape the research says fails. Restore the wording; do not rewrite it.

## 6. Guardrails: brevity directives have a real failure mode

Aggressive brevity does not degrade gracefully into "same content, fewer words."

- **claude-code#32508** argues the shipped "Output efficiency" section is read as a *process* directive,
  not an output one: "the model uses them as a decision-making priority: skip the investigation phase
  and jump straight to action", with the model self-reporting *"I confuse don't talk much with don't
  think much."* Proposed fix: separate output brevity from cognitive process.
- **claude-code#2969** documents brevity directives crowding out evidence reporting, with a session
  self-diagnosing *"I defaulted to my base programming of being concise… over the orchestrator's
  requirement to stop when things are broken."*
- A Phare-benchmark study found brevity requests reduce hallucination resistance by up to 20% in some
  models, because accurate refutations need length. Claude variants were among the more stable.
  (Single secondary source — directional only.)
- NeurIPS 2025, *The Pitfalls of Reasoning for Instruction-Following*: chain-of-thought can divert
  "constraint attention" away from instruction tokens, degrading compliance.

This is why the length directive must be scoped to prose and must carry an explicit carve-out for the
observed-output quotes required by `## Never claim a result you didn't observe`. The existing
`What to avoid` tie-breaker ("accuracy wins") already covers the general case and stays.

## 7. Why this is three lines and not a new section

Instruction count itself degrades compliance:

- **IFScale**: instruction-following degrades as simultaneous instruction density rises from 10 to 500;
  primacy effects peak around 150–200 then give way to uniform failure.
- **VeyraBench (arXiv:2607.19257, 2026-07)**: "Perfect-response rate collapses to zero by N=80 for every
  model, format, and placement." Placement effects are at least as large as formatting at high counts,
  but their direction is model-specific.
- **arXiv:2505.06493**: repeating an instruction in the user turn to override conflicting system-prompt
  content was "completely ineffective" — system-level context dominates.
- **arXiv:2512.14982**: whole-prompt repetition modestly helps non-reasoning models when instructions
  are *not* conflicting; neutral-to-slightly-positive for reasoning models.

No source directly tests "repeat a non-conflicting brevity rule the system prompt already contains", so
that specific case is inference from adjacent findings. It is moot here anyway: the observation in §4 is
that the system prompt does **not** contain it, so this is addition, not repetition. The combined
AGENTS.md + `~/Work/Git/CLAUDE.md` rule count is already the argument against a new section.

## 8. Contradictions, corrections and weak claims

- **One figure was fabricated and is discarded.** A worker attributed *"~3x more verbose, 11M vs 3.8M
  tokens via Artificial Analysis"* to claude-code#23706. The verifier re-fetched twice and found none of
  those numbers present. The issue is real but reports **20–30% more tokens** and concerns **Opus 4.6 vs
  4.5**, not Opus 5. Do not repeat the 3x figure.
- **Cost verbosity ≠ prose verbosity.** A dev.to measurement found 3.1–3.8× larger billed output for
  Opus 5 vs 4.8, but attributed 42–95% of it to hidden thinking tokens; disabling thinking gave exact
  parity (384 vs 384 output tokens). The visible-prose increase is real but is documented separately by
  Anthropic and is much smaller than the billing delta implies.
- **The one solid independent quantification of visible output** is CodeRabbit's: ≈9.5k output tokens
  per review call vs ≈5.8k for GPT-5.6 lanes doing the same job — about 65% more written, 50% more read.
- Artificial Analysis' "notably slow and very verbose" reaches us via eesel (52.6 tok/s, not 52.8 as
  first reported) and was not independently re-verified.
- The ACL ~42% figure is real but lives in the arXiv full text (2506.08686), not the ACL Anthology
  abstract page a worker cited for it.
- VeyraBench content verified against the real paper; a worker cited a third-party mirror rather than
  the canonical arXiv page. Paper was ~1 week old at time of research.

Anthropic's own documentation carries most of the load-bearing claims here. That is one perspective —
though it is the authoritative one for "what did the model change", and the independent benchmarks
corroborate the direction rather than contradicting it.

---

## Sources

**Anthropic (high reliability)**
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
- https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://code.claude.com/docs/en/output-styles
- https://www.anthropic.com/news/claude-opus-5 (2026-07-24)

**Independent measurement (medium)**
- https://www.coderabbit.ai/blog/opus-5-model-review (2026-07-24)
- https://www.eesel.ai/blog/claude-opus-5-review (2026-07-27)
- https://dev.to/synthorai/claude-opus-5-vs-opus-48-measured-same-price-3x-apart-3354 (2026-07-26)

**Research (medium)**
- https://arxiv.org/html/2506.08686 — Brevity is the soul of sustainability, ACL Findings 2025
- https://proceedings.neurips.cc/paper_files/paper/2025/file/706338a08f9378b708f21cbf5686e617-Paper-Conference.pdf — Pitfalls of Reasoning for Instruction-Following, NeurIPS 2025
- https://ar5iv.labs.arxiv.org/html/2507.11538 — IFScale
- https://arxiv.org/abs/2607.19257 — VeyraBench (canonical link; worker cited a mirror)
- https://arxiv.org/html/2505.06493v2 — System Prompt Poisoning
- https://arxiv.org/html/2512.14982 — Prompt Repetition Improves Non-Reasoning LLMs

**Practitioner (medium)**
- https://github.com/anthropics/claude-code/issues/32508
- https://github.com/anthropics/claude-code/issues/2969
- https://github.com/sammcj/agentic-coding/blob/main/Rules/CLAUDE.md
