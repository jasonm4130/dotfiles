# AGENTS.md / CLAUDE.md best practices + AI engineer workflows

**Date**: 2026-05-09
**Context**: Audit of `~/.ai/AGENTS.md` (rendered into per-tool files) against current vendor guidance and practitioner consensus, plus a survey of the workflows the highest-leverage AI engineers actually use.
**Outcome**: Punch list applied at commits `60dffed` (rules) and `c4b2db4` (cleanup).

---

## Part 1 — AGENTS.md / CLAUDE.md best practices

### Key findings

1. **Length: target <200 lines.** Anthropic's docs target this explicitly. ClaudeGuide's empirical test (50/100/200/400 lines) found rule adherence dropped from **94% → 71%** as files grew. Past ~200 instructions, frontier models' compliance "decays fast."
2. **Specificity wins over aspiration.** Universal anti-pattern: "be careful," "write clean code." Effective rules: `ALWAYS run pnpm typecheck before claiming done`, `Never import from src/internal/*`. GitHub's analysis of 2,500+ AGENTS.md files found top-tier files cover six concrete areas: commands, testing, project structure, code style invariants, git workflow, hard boundaries.
3. **What goes IN**: exact commands with flags, stack with versions, directory map (one line per dir), invariants the codebase enforces, three-tier boundaries (always do / ask first / never do), `file:line` pointers.
4. **What stays OUT**: rules a linter already enforces ("never send an LLM to do a linter's job"), generic best practices, README content duplication, inlined code snippets (they go stale — link instead), aspirational policies.
5. **The "agent ignored my CLAUDE.md" problem is real.** Two distinct causes:
   - **Soft authority**: Claude Code wraps CLAUDE.md with a "may or may not be relevant" system-reminder that contradicts your `MUST follow` framing. Healthy files only get ~70% rule compliance.
   - **System-prompt override**: built-in plan-mode / sub-agent prompts beat user CLAUDE.md. Workaround: deliver critical rules via `SessionStart` hook (bypasses the qualifier injection).
6. **Render-from-template approach is validated.** Matches the [Helmsman pattern](https://www.seuros.com/blog/helmsman-adaptive-instructions-for-ai-agents/) — a step ahead of plain symlinks; well-positioned for genuine per-model divergence.

### Vendor stances (mixed and worth knowing)

| Tool | File | Size guidance | Notes |
|---|---|---|---|
| Anthropic CLAUDE.md | `CLAUDE.md` (also `~/.claude/`, `.claude/CLAUDE.md`, `CLAUDE.local.md`) | **<200 lines** | Doesn't read AGENTS.md natively — needs `@AGENTS.md` import or symlink |
| OpenAI Codex AGENTS.md | `AGENTS.md` | **32 KiB** silent truncation | Walks root → cwd; supports `AGENTS.override.md` |
| Cursor | `.cursor/rules/*.mdc` | Per-rule frontmatter | `.cursorrules` deprecated as default; reads CLAUDE.md as always-on |
| Aider | `CONVENTIONS.md` | n/a | Not auto-discovered — explicit `read:` config required |
| Gemini CLI | `GEMINI.md` | n/a | Configurable via `.gemini/settings.json`; can accept AGENTS.md |
| GitHub Copilot | `.github/copilot-instructions.md` + `.github/instructions/*.instructions.md` | n/a | `.github/agents/*.md` "agents.md" persona files are a **different concept** from the AGENTS.md spec |

The AGENTS.md spec is **stewarded by the Linux Foundation's Agentic AI Foundation**; ~60k+ repos by early 2026.

### Common failure modes worth auditing for

- **Token bloat** — 5,000+ tokens "meaningfully reduces effective working context"; healthy files run 300–600 tokens
- **Negative-only rules** — every "never" needs an "instead" — naked prohibitions leave the model to improvise
- **Conflicting rules** — "Never add comments" + "Document complex logic" is a common contradiction
- **Drift** — stale `package.json` commands, dead path references, nested files contradicting root. Tooling: `agents-doctor`, `cursor-lint`, `rule-porter`
- **README duplication** — AGENTS.md is for *agent-specific operational knowledge*. If a human would read it too, it belongs in README

### Hierarchical / per-directory pattern

Both Claude Code and Codex walk the directory tree merging files. Recommended pattern: **root file as a lean map/table-of-contents**, push domain-specific rules into per-package files. OpenAI's main monorepo has **88 nested AGENTS.md files**.

For Claude Code: `.claude/rules/*.md` with `paths:` frontmatter for path-scoped rules that only load when matching files are touched.

### Surfaced contradictions

1. **Length ceiling varies wildly**: HumanLayer says <60 lines ideal; community consensus 200–300; some practitioners say 500 hard cap.
2. **Human-curated vs LLM-generated**: Princeton's "28.6% faster runtime" finding only held for human-curated files. LLM-generated ones showed -3% success / +23% cost.
3. **`AGENTS.md` (plural) vs `AGENT.md` (singular)** — competing splinter standard at agentdotmd.github.io.
4. **Unified is best vs Helmsman per-model** — both defensible.
5. **Copilot AGENTS.md support** — marketing says yes, GitHub issue #175649 reports it ignored AGENTS.md in VSCode in late 2025.

---

## Part 2 — AI engineer workflows (late 2025 / early 2026)

### Core patterns

**1. Plan before code (near-universal).** Anthropic's "Best practices for Claude Code" prescribes Explore → Plan → Code → Verify. Skip plan-mode only for one-sentence changes. *"Letting Claude jump straight to coding can produce code that solves the wrong problem."*

**2. Architect/Implementer separation** (Jesse Vincent's pattern): one Claude session reviews plans with fresh eyes; another executes. `/clear` between chunks to avoid context bloat.

**3. Parallel agents are mainstream** — but two distinct models:
- **Across tasks** (Hashimoto: run multiple agents on the same problem, merge by hand because "no one agent wins")
- **Within a task** (Gopal: Implementer / Tester / Documenter sub-agents in parallel)
- Anthropic's power-user guide pushes 3–5 worktree sessions

**4. Verification is THE highest-leverage habit.** Anthropic's team statement: *"the single most impactful tip in this guide is verification"* — give the agent a way to close its own feedback loop. Concrete tactics:
- TDD-first prompts (write the failing test, then fix)
- Git-hook truth checks
- Adversarial review prompts ("Grill me on these changes — don't make a PR until I pass your test")
- Subagent review of skills

**5. CLAUDE.md grows by correction.** Anthropic team rule: *"anytime Claude does something incorrectly, add it to CLAUDE.md… end with: 'Update your CLAUDE.md so you don't make that mistake again.'"* Mitchell Hashimoto's Ghostty AGENTS.md follows the same model — every line is a past failure.

**6. Skills are the new primary extension primitive.** Anthropic: *"we now have hundreds in production."* Pattern: small **micro-skills** that chain, not monoliths.

**7. MCP usage is being replaced by shell scripts.** Simon Willison + Shrivu Shankar agree — MCP's remaining role is auth/security boundary, not agent abstraction.

**8. `/clear` aggressively past ~70% context.** Morph + Anthropic both say `/clear` rather than push through. *"If you've corrected Claude more than twice on the same issue, clear and start fresh."*

**9. Geoffrey Litt's mental model**: *"I'm trying to code like a surgeon… A surgeon isn't a manager, they do the actual work — but their skills and time are highly leveraged with a support team. When I sit down for a work session, I want to feel like a surgeon walking into a prepped operating room."*

### Anti-patterns even experienced practitioners fall into

- **CLAUDE.md bloat** — Boris Cherny's (Claude Code creator) is reportedly **8x shorter** than typical user files
- **Skipping permissions wholesale** with `--dangerously-skip-permissions` instead of `/permissions` allowlists
- **Cargo-culting MCP servers** that could be shell scripts
- **Trusting external review tools verbatim** (CodeRabbit etc.) — Vincent's "credulous robot" trap
- **Treating completion as a design event** — agent says "done" after pattern-matching, not running. Hook-enforced verification before "done" is accepted

### Contradictions worth knowing

- **One CLAUDE.md vs. many**: Anthropic team invests heavily in one shared root file; minimalists keep it tiny and split by subdir/skills
- **MCP dead vs. essential**: depends on whether work crosses an auth boundary
- **Sub-agents for parallelism vs. context isolation**: optimize for different metrics

---

## Decisions applied to `~/.ai/AGENTS.md` (commits `60dffed`, `c4b2db4`)

**Added** (per Punch List A):
1. Verification before claiming complete
2. Plan before non-trivial work
3. Context hygiene (`/clear` past 70%, after 2 failed corrections)
4. When corrected, update this file (self-improvement loop)

**Removed** (per Punch List B):
- `claude-extras.md` (graphify trigger now lives in skill frontmatter)
- `codex-extras.md` (was empty)
- The `cat`-based concat in `render.sh` (now pure `cp`)

**Final state**: 30 lines, CLAUDE.md and codex/AGENTS.md are exact copies — single source of truth.

**Deliberately NOT added** (per research):
- Code style rules (linter's job)
- Generic "be careful" guidance
- README content duplication
- Inlined code snippets

---

## Sources

### Vendor docs

- [Anthropic Claude Code Memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [OpenAI Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Cursor Rules](https://cursor.com/docs/rules)
- [Aider Conventions](https://aider.chat/docs/usage/conventions.html)
- [Gemini context files](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html)
- [GitHub Copilot custom instructions](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot)
- [agents.md spec](https://agents.md/)

### Best practices

- [GitHub Blog: lessons from 2,500 repos](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) (2025-11-19)
- [HumanLayer: writing a good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) (2025-11-25)
- [ClaudeGuide: 12 effective patterns](https://claudeguide.io/claude-md-effective-patterns) (2026-04-22)
- [Anthropic blog: using CLAUDE.md](https://claude.com/blog/using-claude-md-files) (2025-11-25)

### Failure modes & contradictions

- [GH Issue #27032: CLAUDE.md soft-authority](https://github.com/anthropics/claude-code/issues/27032)
- [HumanLayer: stop Claude from ignoring CLAUDE.md](https://humanlayer.dev/blog/stop-claude-from-ignoring-your-claude-md) (2026-03-17)
- [self.md: why your CLAUDE.md sucks](https://self.md/articles/why-your-claude-md-sucks/) (2026-02-15)
- [redreamality: deep dive](https://redreamality.com/blog/claude-md-agents-md-deep-dive/) (2026-04-26)
- [amattn: counteract agent drift](http://amattn.com/p/using_agentsmd_or_claudemd_to_counteract_agent_drift.html)

### Workflows

- [Anthropic: best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Claude Code power user tips](https://support.claude.com/en/articles/14554000)
- [Jesse Vincent: How I'm using coding agents](https://blog.fsck.com/2025/10/05/) (2025-10-05) and [Superpowers](https://blog.fsck.com/2025/10/09/) (2025-10-09)
- [Simon Willison: parallel coding agent lifestyle](https://simonwillison.net/2025/Oct/5/) (2025-10-05) and follow-ups
- [HumanLayer: advanced context engineering](https://humanlayer.dev/blog/advanced-context-engineering) and [skill-issue-harness-engineering](https://humanlayer.dev/blog/skill-issue-harness-engineering)
- [Kaushik Gopal: agentic coding flow state](https://kau.sh/blog/agentic-coding-flow-state) and [agents-md sync](https://kau.sh/blog/agents-md/)
- [Mitchell Hashimoto: AI workflow](https://serenitiesai.com/articles/mitchell-hashimoto-ai-workflow) (2026-02-07)
- [Morph: Claude Code best practices 2026](https://www.morphllm.com/claude-code-best-practices) (2026-02-15)

### Hybrid approaches & adoption

- [seuros.com: Helmsman pattern](https://www.seuros.com/blog/helmsman-adaptive-instructions-for-ai-agents/) (2026-01-23)
- [SSW.Rules: symlink AGENTS to CLAUDE](https://www.ssw.com.au/rules/symlink-agents-to-claude)
- [Morph 2026 guide](https://www.morphllm.com/agents-md-guide)
- [InfoQ: AGENTS.md announcement](https://www.infoq.com/news/2025/08/agents-md/) (2025-08-27)
- [openai/agents.md repo](https://github.com/openai/agents.md/)
