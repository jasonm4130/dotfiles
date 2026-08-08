# Harness measurement system — build the cheap instruments, refuse the expensive one

**Date:** 2026-08-09
**Repos touched:** `claude-skills` (hook, skills, test suites), `dotfiles` (settings only if needed)
**Status:** proposed

## Why this plan exists

The recurring question — "is my harness actually making Claude better?" — has no affordable experimental answer. This plan builds the instruments that *do* pay off, and explicitly declines the ablation benchmark that does not.

### What the July 2026 attempt actually did (corrected)

The prior post-mortem in memory said "flaky, never finished." Verified 2026-08-08, the sharper version:

- The run **executed** and produced results: `claude-skills` branch `wip/benchmark-results`, commit `0864c7b` ("park the 2026-07-18 eval run outputs — NOT for merge"). Harness on `feat/eval-harness`.
- `benchmarks/results/runs/2026-07-18T17-27-25-980Z/scorecard.md` self-reports **`UNRELIABLE (exit 2)`**:

  | adapter | catch | over-reject | flip | error | coverage |
  |---|---|---|---|---|---|
  | code-review | 0.885 | 0.474 | 0.231 | 0.019 | 1.000 |
  | sdd-reviewer | 0.882 | 1.633 | 0.353 | **0.295** | **0.712** |
  | codex | 0.875 | 0.808 | **0.000** | 0.038 | 0.962 |

- Root cause: `sdd-reviewer` at 29.5% error / 71.2% coverage made its over-rejection figure uninterpretable. **The cross-vendor `codex` adapter was the stable one** (flip rate 0.000).
- `~/Work/Git/jason-bench` is a *different, earlier, never-run* project (all 28 commits 2026-07-11, `runs/` empty). Do not diagnose July from it.

### Why the ablation benchmark stays unbuilt

Three independent reasons, any one sufficient:

1. **Underpowered by its own arithmetic.** A 20–30 task corpus gives power 0.37–0.59 to detect a 30-point effect, while the literature bounds real context-guidance effects at ≤10–15pp. The modal result is an uninformative null at every affordable budget.
2. **Structurally uncompletable.** Claude Code ships multiple times a week; a valid experiment cannot merge data across versions; a 40–120 pair run at ~213s/run spans weeks. It can never accumulate enough valid pairs inside one version window.
3. **Measures the wrong thing.** Clean-room arms (`--setting-sources ""`) delete skill *interference*, which is the interesting failure mode of an 18-skill library. A win wouldn't transfer; a null wouldn't exonerate.

---

## Task 1 — Capture tool outcomes in the event log

**Repo:** `claude-skills` · **File:** `plugins/session-retro/scripts/posttooluse-append-event.mjs`

Today the hook writes `{ts, tool, input}`. Across 847 event files and ~128k events it records what was *attempted* and nothing about what *worked*.

**Correction to an earlier framing:** this is *not* urgent-because-the-window-is-rolling. The event store has no retention at all — it spans `2026-05-25T12:05:00Z` → `2026-08-08T21:16:48Z` (75 days, 48,334 events before 2026-07-10). Nothing is expiring. Do it because it is cheap and unblocks Task 4, not because of a deadline that does not exist.

### 1a. Fix the pre-existing atomicity violation first

The file's comment claims events are ≪4KB so `appendFileSync` is atomic under `PIPE_BUF`. **That is already false.** Measured over the live store: **3,108 events exceed 4KB, p99 is 7,392 bytes, max is 118,989 bytes.** The `input` field — a full `Edit` payload, a long `Bash` command — is what blows the bound. Concurrent hook invocations can therefore already interleave and corrupt JSONL lines, independent of anything this plan adds.

So truncating only `err` cannot make the log safe. Define and enforce a **whole-event byte budget** (target: keep the serialized line under 4KB) with an explicit truncation/redaction policy for `input`, applied before the append. Record what was truncated (e.g. `input_truncated: true`) so downstream analysis can tell a short payload from a clipped one. This is a bug fix that stands on its own merits.

### 1b. Then add the outcome fields

- `ok` — **`boolean | null`**. `true`/`false` when the payload carries a usable outcome signal; `null` when it does not. Consumers must treat `null` as *unknown* and exclude those events from outcome-rate denominators — never coerce it to `false`, which would inflate the failure rate. Document the tri-state at the point of definition so a consumer written against "boolean" cannot silently reject or mis-coerce.
- `err` — error string, bounded, present only when `ok` is `false`.
- A correlation key (`tool_use_id` is present in the payload) so results can be tied to their call.
- A schema marker (`v: 2`) so Task 4 can select only events written by the new hook.

**Deriving `ok` is not trivial and must be gated on real payloads.** Local hook docs name `tool_result` while the installed code consumes `tool_response`; the binary contains `is_error`, `tool_error`, and `tool_response`. Worse, the `Bash` response carries only stdout/stderr/interrupted — **no exit code** — so "wrote to stderr" and "failed" are not distinguishable by a naive rule, and `Edit` failures have a different response shape again.

**Acceptance gate before writing the derivation:** capture representative *successful and failed* payloads for each of `Edit`, `Write`, `Bash` from a live session. Then specify explicit field precedence and a defined fail-safe for when no outcome signal exists (record `ok: null`, never guess). Do not ship a boolean that silently mislabels.

**Verify:**
- `node --test plugins/session-retro/tests/posttooluse-append-event.test.mjs` — extend with success, failure, and no-signal cases per tool; assert `ok` precedence and the byte budget.
- Assert serialized event length stays under 4KB for a worst-case `Edit` payload plus a long error.
- Bump `plugins/session-retro/.claude-plugin/plugin.json` **and** the root `.claude-plugin/marketplace.json` off `0.7.4`, then reload/reinstall the plugin. Without this the cached `~/.claude/plugins/cache/.../session-retro/0.7.4/` hook keeps running and the "live session writes `ok`" check silently passes on old code.
- Confirm a live session writes `ok` and `v: 2`, and that pre-existing events without them still parse.

## Task 2 — Delete the dead skills

**Repo:** `claude-skills`

Invocation counts over the rolling ~30-day transcript window (verified exactly, 2026-08-08):

| skill | invocations |
|---|---|
| `codebase-design` | **0** |
| `adr` | 1 |
| `writing-artifacts` | 1 |
| `writing-skills` | 1 |
| `docs-consolidate` | 1 |
| `domain-modeling` | 2 |
| `frontend-design` | 2 |

`writing-skills` already carries the rule: *find the inbound edge; if there isn't one, give it one or delete it.* Every skill's description loads every session whether or not it fires, and the context-rot literature finds *topically-adjacent but irrelevant* content is the kind that degrades accuracy.

Per skill, decide **delete** or **give it an inbound edge** — do not leave any in the current state. Note `writing-skills` is self-referential (it governs skill authoring); deleting it needs more thought than the rest.

**Cross-repo obligation — deleting from `claude-skills` alone leaves a broken install.** `dotfiles/private_dot_claude/settings.json` currently has `enabledPlugins` entries for `codebase-design@jasonm4130-claude-skills`, `writing-artifacts@jasonm4130-claude-skills`, and `domain-modeling@jasonm4130-claude-skills` (among others). Removing a plugin from the marketplace while its `enabledPlugins` entry survives produces a broken rendered config after `chezmoi apply`. Enumerate the matching `enabledPlugins` removals as part of this task.

**Verify:** `.claude-plugin/marketplace.json` stays valid; matching `enabledPlugins` keys removed from the chezmoi *source* (not the rendered copy); `chezmoi apply` renders clean; plugin set loads with no errors; no dangling `[[links]]` or skill cross-references.

## Task 3 — Tier 1 deterministic checks

**Repo:** `claude-skills` · Run with `node --test`, zero or near-zero model calls, minutes not hours.

- **3a. Hook conformance** — each hook script, given a representative payload on stdin, exits 0 and writes the expected shape. Covers the only enforcement layer in the harness.
- **3b. Guard denial suite** — `lsp-first-guard`, `secrets-scan`, `disk-guard` actually *deny* what they claim to deny. Assert on the deny decision, not just exit code.
- **3c. Config-load canary** — ~10s check that settings parse and plugins load; run after every `chezmoi apply`.

These target near-binary regressions (100%→0%), which n=3–5 genuinely catches, and they survive six months untouched.

## Task 4 — Observational metrics (only after Task 1 has ~2 weeks of data)

**Select only `v: 2` events.** The store holds 75 days of pre-change events with no outcome field. Treating absent `ok` as either true or false would contaminate the new instrument with ~128k unknown-outcome rows — filter on the schema marker, and decide a retention policy for the pre-change tail (archive or delete; do not silently mix).

- From the annotated event log: revert rate and error-following-tool-use.
- **Rework loops need their metric defined before Task 1 is coded, not after.** "Same file re-edited for the same issue" is not derivable from the current schema: there is no issue identity, and timestamps are second-resolution only, so two unrelated edits to one file in a session look identical to a genuine retry loop, while an error retried through a *different* tool is missed entirely. Either (a) capture the correlation metadata that makes it computable in Task 1b, or (b) narrow this to what the schema honestly supports — e.g. consecutive failed calls on the same `tool` + target within a bounded window — and say so. Do not carry the stronger claim forward unbacked.
- From `~/.claude/codex-review-log.jsonl`, as a paired before/after metric. **The two modes are different instruments — never pool them** (round 1, verified 2026-08-08):

  | mode | n | verdicts | p1 on REVISEs |
  |---|---|---|---|
  | `review` (plans) | 74 | 69 REVISE, 5 timeout, **0 APPROVED** | mean 2.84, 3 zeros |
  | `diff` (code) | 102 | 69 REVISE, **19 APPROVED**, 14 timeout | mean 0.29, 54/69 zero |

  Use **diff-mode `APPROVED` rate** (21.6% base among non-timeouts) as a binary outcome for code changes; **review-mode `p1` count** for plans. Severity is nested at `findings.p1`, not top-level. Round-1 timeout rate is 10.8% — exclude timeouts explicitly rather than scoring them as failures.

**Calibration gate before trusting any of it:** hand-check ~20 logged p1 findings for whether they were real. LLM judges exhibit reliability without validity — consistent and biased is a live failure mode.

## Task 5 — Keep the no-guidance control unchanged

It works *because* it asks a binary existence question at n=1–3 ("does the failure occur without this guidance?"), not an effect-size question. Optionally extend it to periodically re-gate *shipped* skills, not only new ones — scaffolding does go obsolete as models improve.

---

## Explicitly out of scope

- The Tier 2 ablation harness, for the three reasons above.
- Ranking the skill library by measured effect — unmeasurable by construction at this scale.
- Anything from `codeburn optimize`: it prices a flat Max plan at API list rates and its remedies trade quality for tokens.

## Salvage before building

`claude-skills` `feat/eval-harness` already implements a hashed response cache (~530 files), a stratified scorecard with coverage gates and floors, and a two-stage matcher with a cached judge. Reuse or explicitly reject it — do not rebuild blind.

## Known unknowns

- Exact PostToolUse field name and precedence for the error signal per tool — resolved only by capturing live payloads (Task 1b acceptance gate).
- How to distinguish a failing `Bash` call from a succeeding one that writes to stderr, given the response carries no exit code.
- Retention policy for the 75-day pre-change event tail: archive, delete, or leave and always filter on `v`.
