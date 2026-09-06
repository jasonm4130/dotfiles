# Codex setup: measured baseline and next decisions

Jason and future agents should use this record to decide what to change next.
Keep Codex as the primary harness while measuring real project work. The current
setup is a tested migration baseline, not a demonstrated optimum for Astra.
No published practitioner recipe establishes the best configuration for these
four repositories or guarantees that ChatGPT Pro 20× limits cannot be reached.

## What the practitioner comparison changes

| Primary source | Transferable practice | Decision for this setup |
|---|---|---|
| [Peter Steinberger's current agent-scripts](https://github.com/steipete/agent-scripts/blob/main/README.md) | Shared instruction ownership, focused skills, small helpers, validation | Keep chezmoi as the owner and repo-backed skill links. Do not install his entire personal toolchain. |
| [OpenAI's harness engineering case study](https://openai.com/index/harness-engineering/) | A short instruction map, repository knowledge, worktree-local execution, executable invariants | Preserve project-specific docs and build isolation. Prioritize missing project guards over more global prompt text. |
| [Mario Zechner's account of building pi](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) | A minimal, inspectable harness with extensions for concrete needs | Keep pi as an experiment when a specific Codex limitation warrants it; its design philosophy is not an Astra comparison result. |

Sources were read on 2026-09-06. Peter's repository is living practice; OpenAI's
case study dates to February 2026 and Mario's design account to November 2025.
These are engineering examples, not controlled rankings of practitioners.
Do not copy their permissions, identities, merge policies or automation budgets.

## Working baseline

Astra medium remains the interactive default. Terra's read-only review profile
remains available for bounded routine review. Neither model/effort choice has
been benchmarked against the other's quality and allowance use on Jason's tasks.
Escalate effort for demonstrated reasoning difficulty, not for every task.

Keep shared instructions in AGENTS.md, project contracts in repository docs,
learned context in native memory, and unfinished work in explicit handoffs.
The native memory setting now has a 25% remaining-quota threshold. This threshold
gates background generation; it does not reserve allowance against foreground
work or guarantee that an in-flight request cannot exhaust a limit.

Do not add an external memory database, wholesale skill pack, automatic review
swarm, paid API fallback, or unattended job merely to match a practitioner's setup.
Prefer an existing CLI for a task it handles well; add MCP or a focused skill
when a repeated task exposes a concrete access or workflow gap.

## Repeatable improvement workflow

1. Select one real upcoming task and define its acceptance evidence.
2. Record model, effort, harness, elapsed time and allowance before starting.
3. Run the task with the current baseline and the repo's actual checks.
4. Record retries, missed constraints, review findings and human interventions.
5. Identify the limiting factor: model reasoning, context, tools or verification.
6. Change one factor and compare on a similar task or isolated reproduction.
7. Keep a change only when the evidence supports its benefit.

Allowance percentages can be rounded and include concurrent activity. Do not
convert transcript token counts or wattop dollar estimates into plan balances.
Use `codex-usage` and note concurrent sessions before attributing a change.
Do not duplicate heavy production work just to manufacture an A/B result.

## Project readiness gates

| Project | Required next acceptance evidence |
|---|---|
| transcoder | Fresh-session nextest/invariant context; port and integration-test nextest and PR-base guards before unattended use; actual hardware proof for encoder changes. |
| ambient | Resume the correct night clone; isolate build output for concurrency; verify loop guards in Codex rather than relying on Claude test results. |
| claude-skills | Preserve upstream template ownership; port only the workflow being used; verify skill discovery and hook payload semantics in a real Codex session. |
| ai-dashboard | Run the dashboard's live path and manual QA for changed UI; keep estimated dollars separate from actual allowance. |

These project tasks are not completed by the global setup audit. Porting
Nightwatch requires its own bounded execution design and tests before launch.
The existing [operation record](codex.md) distinguishes active protections from
Claude-only components. Native recall is a separate check, not proof of project
readiness or permission to start an overnight run.
