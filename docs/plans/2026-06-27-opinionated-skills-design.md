# Opinionated Skill Set — Design & Migration Plan

> Source: 24-agent deep review (research Grove/Karpathy/Yegge/Kim/Pocock + mattpocock/skills →
> 4 design proposals → 3 judges → synthesis → 4-skeptic red-team → this plan). 2026-06-27.

## TL;DR

- **Going bespoke is worth it — but the bespoke move is subtraction, not addition.** Your architecture (9-skill deny list + 6 working flagships in your own marketplace) is already the opinion. The red-team killed the one thing the original design wanted to *build*.
- **Build zero new skills.** The proposed `spec` skill rested on a false premise — "0 spec files across 36 repos." Verified: **~70 dated spec files exist across 18 repos**, at the exact `YYYY-MM-DD-<slug>.md` format proposed, produced automatically by the `brainstorming` skill you keep. A user-invoked skill can't raise the rate of a practice you already perform ~70 times by hand.
- **Cut 2, not 3.** graphify and playwright go. **Keep adversarial-agents** — it's your own plugin (zero re-merge tax), the proposed `grill` replacement is a strictly-worse subset that reintroduces a banned anti-pattern, and this very red-team *is* the adversarial-agents pattern. Demote it to user-invoked instead of deleting it.
- **The real new value is ~4 prose/frontmatter edits, all on existing surfaces:** standardize the spec *path* (one line), extend TDD-to-features (stack-agnostic, one line), move the stack-runner table to the code-scoped CLAUDE.md, and properly deconflict deep-dive ↔ deep-research (frontmatter one-liner).
- **Corrected net delta: 0 new skills · 0 forks · 2 cuts · 1 keep-reversal (adversarial-agents) · ~4 edits.**

---

## Thesis

The five thinkers collapse into one move each, and after the red-team **four of the five resolve to "already covered — name it, don't build it."**

- **Grove (spec as source of truth).** Already satisfied: ~70 committed dated specs + a mandatory `brainstorming` gate that writes them. The bespoke contribution is to *name the canonical path* so intent stops fragmenting across two directories — one sentence, not a skill.
- **Karpathy (tight verify loops, autonomy slider).** `workflow-model-guard` is the leash. The verify loop is already prose rule 4 + the LIVE `systematic-debugging` skill. The only new bit worth keeping is a *stack-agnostic* TDD-for-features line.
- **Yegge (agent fleets / CHOP).** Already control flow in `sdd.mjs` + `git worktree` aliases + `clean_gone`. Not a skill.
- **Kim (flow / fast feedback / continual learning).** Already `handoff` + `session-retro` (362 event files, real infra). Not a skill.
- **Pocock (skill authoring discipline).** The kept `writing-skills` (46KB Anthropic guide) plus his repo, read *at the point of a real build*. With zero near-term builds, a standing 30-line authoring framework is abstraction-for-a-single-use — cut.

Opinionated by subtraction: a deny is near-free, a CLAUDE.md line is one-time and always in context, and every fork is a re-merge tax on each upstream release. The taste is in what you refuse to install.

---

## Final Keep / Fork / Create / Cut table (post-red-team)

| Skill | Action | Home | Rationale (verified) |
|---|---|---|---|
| subagent-driven-development | **Keep** | jm-skills | `sdd.mjs` encodes the implement→review→fix loop as control flow; justifies 4 of the 9 denies. |
| deep-research | **Keep** | jm-skills (plugin v0.2.0) | Verified it is `jasonm4130-claude-skills/deep-research`, **not** an Anthropic built-in. Heavy web-research DAG path. *Flag: not in the global `enabledPlugins` block — confirm before relying on it.* |
| deep-dive | **Keep + frontmatter edit** | jm-skills | Fast *contained, repo/code-local* fan-out. Re-justified on **scope/latency**, not cost. Make **user-invoked** to kill the trigger collision. |
| handoff | **Keep + 1 line** | jm-skills | 19 uses, 2-hook infra; add the de-dup rule. |
| session-retro | **Keep** | jm-skills | 362 event files; infra is the value. |
| visual-plan | **Keep** | jm-skills | Committed Markdown ADR/plan/recap. ADR mode → vetoes any `adr` skill. |
| workflow-model-guard | **Keep** | jm-skills | Only real model-tier guard hook. |
| **adversarial-agents** | **KEEP (reversal) + make user-invoked** | jm-skills | Your own plugin → zero re-merge tax. Proposed `grill` is a strict subset that re-adds "recommended answer" sycophancy. Demote to user-invoked so it stops taxing context, keep the artefact-aware code/security panel for CF Workers. |
| superpowers:brainstorming | **Keep upstream** | upstream | 34 uses; **already writes the spec artifact** + self-reviews. This is *why* `spec` is dead. |
| superpowers:systematic-debugging | **Keep upstream** | upstream | LIVE, not denied. Already gates reproduce-before-hypothesis. |
| superpowers:writing-plans | **Keep upstream** | upstream | SDD consumes its `# Task N` format. Don't fork (breaks the contract). |
| superpowers:writing-skills | **Keep upstream** | upstream | Never fork Anthropic's official 46KB guide. |
| 9 denied superpowers skills | **Keep denied** | upstream | **Relabel: low-maintenance, not "free"** (name-coupled deny vs unpinned upstream). |
| cloudflare (official) | **Keep** | upstream | Owns the workerd-vs-jsdom / vitest-pool-workers foot-gun → vetoes any bespoke cf-tdd skill. |
| context7, commit-commands, frontend-design, *-lsp, ponytail | **Keep** | upstream | Docs, commits/PR, design, LSP nav, laziness governor. |
| **spec** | **DO NOT BUILD** | — | ~70 spec files already exist at the proposed path/format. |
| spec-path convention | **Configure (1 line)** | ~/Work/Git/CLAUDE.md | Gap is **fragmentation**: 14 repos use `docs/superpowers/specs/`, 4 use `docs/specs/`. Name one canonical path. |
| TDD-for-features | **Configure (1 line, stack-agnostic)** | global AGENTS.md rule 4 | "Failing test first for features too, one at a time, quote red→green." |
| stack runner table | **Configure (3-4 lines)** | ~/Work/Git/CLAUDE.md | vitest / vitest-pool-workers / uv pytest / cargo. |
| debug Phase-1 gate | **DROP** | — | Duplicates LIVE systematic-debugging + the runner table. |
| authoring CLAUDE.md (Pocock + Iron Law) | **DROP** | — | 30-line framework to govern 0 near-term builds. |
| grill / spec-check / tdd sketches | **DROP the sketches** | — | Keep only one-line trigger conditions. |
| graphify | **CUT + remove its hook** | loose (dotfiles) | Runs occasionally (14 `graphify-out/` dirs), but model-invoked description + per-grep nudge hook = standing context tax. Cut must also delete the `graphify-nudge.sh` hook block. |
| playwright | **CUT (reversible) — rationale fixed** | loose | claude-in-chrome + web-perf do **not** cover headless/CI E2E. Cut on "MCP tool-surface tax > rare scripted-E2E use," re-enable per-project when needed. *Rests on an unverified usage claim.* |

---

## Build-ready edits (there is no new SKILL.md to ship)

### A. `~/Work/Git/CLAUDE.md` — spec-path convention + runner table

```markdown
## Specs: one canonical path

Durable intent lives at `docs/superpowers/specs/YYYY-MM-DD-<slug>.md` (the path
`brainstorming` writes by default — ~60 files already there). Do NOT create a
second `docs/specs/` convention. When intent is already clear, skip the
brainstorming dialogue and write the spec straight to that path.

## Test runners (red before green; one test at a time)

- TypeScript: `vitest run -t '<name>'`
- Cloudflare Workers: `@cloudflare/vitest-pool-workers` — run `wrangler types`
  first, mock `cloudflare:*` modules. CF test detail lives in the cloudflare
  plugin; defer to it for the workerd-vs-jsdom env-mismatch check.
- Python: `uv run pytest -x -k '<name>'`
- Rust: `cargo test <name>`
```

### B. `~/.ai/AGENTS.md` (chezmoi source) — extend rule 4, ONE stack-agnostic line

```
For features too (not just bugs): write the failing test first, one test at a
time, test through the public interface. Quote the red line, then the green line.
```

### C. `handoff` SKILL.md — de-dup line

```
Do NOT duplicate content already in specs, plans, ADRs, commits, or issues —
reference it by path/URL.
```

### D. `deep-dive` frontmatter — kill the trigger collision

```yaml
disable-model-invocation: true   # /deep-dive only; deep-research owns NL triggers
```
And re-point its description at the scope axis ("fast contained repo/code-local fan-out") rather than cost.

### E. `adversarial-agents` frontmatter — demote, don't delete

```yaml
disable-model-invocation: true   # /adversarial-agents or "grill me"; no ambient tax
```

---

## Superpowers verdict (definitive)

**Fork: none. Deny: all 9 stay.** The red-team confirmed the structure.

One honesty correction: the 9-deny is **low-maintenance, not free** — it is name-coupled (`settings.json` deny list) against an unpinned upstream. If upstream renames a denied skill, the deny fails *open* and the skill resumes ambient firing silently. Cheap fix: fold a 9-name re-check into the review cadence the global CLAUDE.md already schedules ("Next review: 2026-11-16"). No CI guard needed.

---

## What we deliberately are NOT doing

- **`spec` skill** — ~70 spec files already exist; user-invoked can't raise the rate of an already-automatic practice.
- **A second `docs/specs/` directory** — would fragment intent.
- **30-line authoring CLAUDE.md** — governs 0 near-term builds; duplicates `writing-skills`.
- **Pre-written `grill` / `spec-check` / `tdd` SKILL.md sketches** — scaffolding for 0-1 lifetime uses.
- **`grill` as a replacement for adversarial-agents** — strict subset, re-adds a banned anti-pattern, loses the security panel.

---

## Prioritized migration plan

### HIGH (reversible, zero-risk, do first)
1. **Finish the graphify cut** — remove the skill from dotfiles **and** delete the `graphify-nudge.sh` hook block + script; `chezmoi apply`; confirm the hook block is gone.
2. **Demote, don't delete:** add `disable-model-invocation: true` to **adversarial-agents** and **deep-dive** frontmatter.
3. **Prose edits via chezmoi:** `~/.ai/AGENTS.md` (TDD-for-features line) + `~/Work/Git/CLAUDE.md` (spec-path + runner table). `chezmoi apply`; verify renders.

### MEDIUM
4. **Cut playwright** — after eyeballing whether you've run a scripted E2E this quarter.
5. **handoff de-dup line** + deep-dive scope-axis description tweak.

### LOW (verify, don't build)
6. **SDD loud-failure guard (verify, ~1 assert)** — confirm `sdd.mjs` errors clearly when a plan has no `# Task N` headings.
7. **Optional CI glob** — wire the 18 orphaned plugin test suites only if test-rot bothers you.

---

## Open questions (genuine decisions only)

1. **Canonical spec path:** standardize on `docs/superpowers/specs/` (dominant, ~60 files) and leave the 4 `docs/specs/` repos — or migrate everything to the shorter `docs/specs/`? Lazy default: keep what the tool already writes.
2. **playwright:** have you run a *scripted/headless* E2E (not interactive Chrome) in the last quarter? If yes, keep it; if you can't recall one, cut it.
3. **adversarial-agents demotion:** user-invoked-only acceptable, or keep it ambient-firing on "stress-test this"? Ambient is the only thing that re-incurs its context tax.
