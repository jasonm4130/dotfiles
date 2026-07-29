# Opus 5 verbosity — reconciliation pass on `dot_ai/AGENTS.md`

**Date:** 2026-07-29
**Follows:** docs/plans/2026-07-28-opus5-agent-config-alignment.md
**Research:** docs/research/RESEARCH_opus5_verbosity_2026-07.md
**Scope:** `dot_ai/AGENTS.md` only. No render-script change, no new section.

---

## Why this exists

The 2026-07-28 alignment pass moved `Length is selection, not compression` into the `codex-only`
fence, justified as *"Claude Code's own system prompt now ships equivalents of the following."*

That justification is false as of Claude Code 2.1.220 / Opus 5. The live system prompt carries **no
length or brevity directive at all** — the `"fewer than 4 lines"` / `"minimize output tokens"` block
documented in public captures is from v1.0.85 and v1.0.125 and has been trimmed away. Meanwhile
Anthropic explicitly documents Opus 5 as running longer than prior Opus models and states that effort
does not reliably shorten visible output; the only lever they offer is prompting for it.

Net: the Claude render lost its only length guidance on 2026-07-28, at exactly the moment the model
underneath it became the family's documented verbosity exception.

## Changes

### 1. Un-fence the length directive → rule 3, both renders

Moved out of `codex-only` and appended to rule 3, with three deltas from the fenced original:

- Evidence figure corrected `~88%` → `~60–88%` (ACL 2025 reports ~60% for `MINANS`, ~38% for a plain
  brief directive; 88% was the top of the range, not the headline).
- Citation repointed from `RESEARCH_concise-output.md` (which lives in the claude-skills repo, not
  this one — a dangling reference from this repo's perspective) to the new in-repo research doc.
- Added the anti-fabrication carve-out (see 3).

### 2. Add written-deliverable length calibration

New coverage, not a restoration. Anthropic documents deliverable length as a **third axis**, distinct
from conversational prose and agentic narration: *"files that Claude Opus 5 writes to disk (reports,
Markdown documents, summaries) are often longer than on prior models."*

This is the axis with the highest practical impact here — plans, ADRs, specs and research docs are a
large share of what these configs produce — and it had no coverage in either render. Folded into rule
3 rather than given its own section, per the instruction-saturation evidence (§7 of the research).

### 3. Carve out evidence quoting

`Brevity never licenses dropping evidence — the observed-output quotes required by the next section
are content, not padding.`

Non-optional. claude-code#32508 and #2969 both document brevity directives being read as *process*
directives — skip the investigation, skip the verification reporting — with a model self-reporting
*"I confuse don't talk much with don't think much."* `## Never claim a result you didn't observe` sits
directly downstream of the new text and is exactly what would get crushed.

The existing `What to avoid` tie-breaker ("accuracy wins") stays and is unmodified.

### 4. Fence justification rewritten, with a dated re-verify instruction

The fence's blanket claim is replaced by an instruction to re-verify against the live system prompt on
each Claude Code upgrade, plus the dated record of this specific failure. Banned openers gain a note
that rule 2 carries the directive unfenced and only the enumeration is fenced — that one is still
correctly placed.

`config-review` marker `last_checked` bumped to 2026-07-29.

## What was deliberately not done

- **No effort change.** Effort does not reliably control visible response length on Opus 5, per
  Anthropic and corroborated by CodeRabbit finding the relationship non-monotonic. `effortLevel: high`
  stays.
- **No numeric budgets.** ACL 2025 found rigid word/token limits cause "unnecessary cuts" that strip
  explanatory content alongside filler, and few-shot length examples are ineffective or
  counterproductive. Prose directives are the only shape with evidence behind them.
- **No new section, no output style.** Rule count itself degrades instruction-following (VeyraBench:
  perfect-response rate collapses to zero by ~80 simultaneous rules). Three edits inside an existing
  rule, not a fourth block.
- **No agentic-narration rule.** Anthropic documents it as a third lever, but this repo's existing
  "no trailing recap" and the shipped "do not narrate options you will not pursue" already cover the
  observable symptom. Revisit only if narration remains a felt problem after this lands.

## Verify

After `chezmoi apply`:

- `~/.claude/CLAUDE.md` rule 3 contains "Length is selection, not compression" — it did not before.
- `~/.codex/AGENTS.md` also contains it, exactly once (not duplicated by the fence move).
- The `codex-only` block in the Codex render has three bullets, not four.
- No marker text (`codex-only:start`) leaks into either render.
