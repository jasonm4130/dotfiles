# Codex harness review — 11 September 2026

Keep the native Codex baseline. The next investment should be reliable project-specific verification and a small, review-only feedback loop. This review does not justify reinstalling an orchestration framework or importing somebody else's dotfiles.

This is a comparison of first-hand practitioner accounts, current official guidance, and inspected local configuration. “Best in class” has no objective ranking here. Practitioner reports provide useful hypotheses, not controlled evidence that their entire setup will improve yours. No behavioral settings, skills, hooks, or automations were changed during this pass.

## What the sources support

| Source | Useful practice | Boundary for this setup |
|---|---|---|
| [OpenAI: Best practices](https://learn.chatgpt.com/guides/best-practices), accessed 11 September | Give the goal, relevant context, constraints, and completion criteria. Keep instructions short; add rules after repeated mistakes. Plan difficult tasks and run relevant validation. | This supports the current concise defaults. It does not require a ceremony for every small edit. |
| [OpenAI: current model guidance](https://developers.openai.com/api/docs/guides/latest-model), accessed 11 September | Audit instruction and skill interactions; calibrate delegation and testing to the task. | Keep Astra medium as the existing baseline until comparable tasks demonstrate a reason to change it. This review did not benchmark models or effort levels. |
| [Mitchell Hashimoto: My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey), accessed 11 September | Turn observed mistakes into targeted instructions or tools that give fast feedback. Delegate work with known acceptance criteria. | His account also describes restraint about parallelism. Adopt the feedback principle; do not interpret “always have an agent running” as a utilization target. |
| [Simon Willison: Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/), accessed 11 September | Exercise actual APIs and interfaces as well as automated tests; turn discovered defects into regression coverage. | A passing configuration test cannot prove a phone can resume a task. Use the existing browser/native tools before adding another browser package. |
| [Birgitta Böckeler: Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html), 2 April 2026 | Pair guidance with feedback: tests, linters, runtime observations, and selective semantic review. | Deterministic checks should carry repeatable rules. Another agent's approval is supporting evidence, not proof of correctness. |
| [Peter Steinberger: Shipping at Inference-Speed](https://steipete.me/posts/2025/shipping-at-inference-speed), 28 December 2025 | Build things the agent can run, iterate on tangible results, and make project knowledge easy to find. | His historical model comparisons are not current benchmarks. His commit-to-main and low-code-review preferences are not appropriate defaults for your existing review requirements. |
| [Steinberger's current agent-scripts repository](https://github.com/steipete/agent-scripts), accessed 11 September | Central ownership and discoverable documentation can reduce drift. | It explicitly shares instructions and skills across Claude and Codex. Copying it wholesale would undo your requested separation. This is a current repository snapshot, not an immutable release audit. |
| [Rahul Garg: The Orchestrator's Tax](https://www.martinfowler.com/articles/orchestrator-tax.html), 16 July 2026 | Delegate bounded reasoning to reduce the coordinator's working context; return compact evidence. | The article explicitly draws from one incident. Use it to design a trial, not to prescribe an optimal number of agents. |

There is agreement about clear goals and useful feedback. There is no consensus on running many agents, using a formal plan for every task, or copying a large global instruction file.

## Local findings

| Area | Observed evidence | Assessment |
|---|---|---|
| Personal guidance | `~/.codex/AGENTS.md`: 2,173 bytes; `~/AGENTS.md`: 277 bytes. Native tools and proportional delegation are permitted. | Keep. The combined 2,450 bytes measures these two files only, not total context or latency. |
| Claude separation | Empty fallback-filename list; custom MCP definitions disabled; only Herdr SessionStart in the global hooks file. | Keep the intended boundary. This was a global configuration inspection, not a fresh audit of every repository's local hooks. |
| Skills and session context | Config disables `work-loop` and `writing-artifacts` by name. A forced reload through the shared daemon listed work-loop as disabled and did not list writing-artifacts. This ongoing desktop conversation still advertises the Claude-linked writing skill. | Fresh-runtime evidence is encouraging, but desktop session parity is not established. Recheck in a new desktop task after restart. Do not treat an old task's context as a clean launch. |
| Historical memory | The supplied memory summary still contains earlier advice to default substantive launches to the work-loop. | Historical preference conflicts with the current user instruction. Treat the current instruction as authoritative. Propose a narrow memory correction for explicit approval; do not rewrite generated memory files. |
| Model and tools | Astra medium; native memory enabled; no custom agent roster; computer-use and node_repl enabled. | No measured reason to change the model. Enable additional integrations for a concrete task, not as a default collection. Installed tool count alone is not a context measurement. |
| Configuration checks | Existing `codex-config.test.mjs` and `agents-render.test.mjs`: six tests passed. | Useful coverage of configuration preservation and Claude renderer isolation. These tests do not establish fresh-machine installation or end-to-end remote connectivity. |
| Cross-device sessions | Shared daemon responds; remote status remains `errored`. Earlier logs identified HTTP 409, another server already online. | Still pending the desktop restart and phone check, as agreed. This remains an operational prerequisite, not evidence that the harness needs more prompts. |

## Keep / change / avoid

**Keep:** short global instructions, repo-local conventions, native sandbox and approvals, direct CLI tooling, chezmoi ownership, native memory with historical-context caution, and Herdr's narrow lifecycle role. Keep one main task owner; delegate genuinely independent work or a focused review when it helps.

**Change next — proposals for review, in order:**

1. **Finish surface parity when home.** Restart the desktop and open a fresh task. Check which instructions and skills it receives, then start a terminal task and continue that same task from the phone. Success means the same task ID and a successful follow-up, not just a visible title. Check that the remote connection reports connected. If the writing skill remains available, investigate its discovery path before removing anything.
2. **Audit one active project's verification instructions.** Start with the next project you actually work on. Record the exact setup command, focused test command, full required gate, and one real behavior check in its existing documentation. Reuse existing scripts. This pass did not inspect all project CI pipelines, so missing commands are a question to investigate, not an established defect.
3. **Pilot a manual improvement review over five substantive tasks.** Keep a small repo-local log only if approved. For each observed failure, record the task/commit, expected behavior, actual evidence, correction, and whether it recurred. Review at most three proposals after the fifth task. Prefer a regression test or deterministic check; add an instruction only for a recurring decision the tools cannot enforce.
4. **Correct the obsolete memory preference with approval.** Add a native memory correction stating that the custom work-loop is no longer the default. Preserve useful historical project evidence. Acceptance is a fresh task recalling the current preference without prescribing the old workflow.

**Avoid:** importing another practitioner's complete harness; fixed planner/worker/reviewer ceremonies; mandatory maximum reasoning; universal TDD for trivial configuration edits; automatic rule rewriting; recurring audits before the manual process proves useful; duplicate MCPs without a concrete capability gap; and treating a reviewer agent's “PASS” as equivalent to an observed result.

## Proposed improvement record

Use this small record in project documentation, not as another always-loaded global file:

- Evidence: task/commit and the specific failure or repeated correction.
- Candidate: the smallest test, tool, documentation, or instruction change.
- Expected benefit: the behavior that should improve.
- Cost: extra steps, runtime, maintenance, and context if applicable.
- Acceptance: a comparable task or test demonstrating the improvement.
- Decision: proposed / approved / trial / kept / reverted.

For example, this setup had a disabled skill configuration that did not immediately match what an existing conversation advertised. The candidate is a fresh-session check after instruction changes, not another paragraph telling the model to ignore skills. Keep that check if it reliably detects stale configuration; avoid running it on unrelated coding tasks.

## Working at the new speed

A short request is enough when it names the outcome and a way to verify it:

> Fix X in this project. Preserve Y. Done means Z works and the relevant checks pass. Ask me only about decisions that materially change the outcome.

For uncertain product work, ask for an interview and plan first. For an ordinary, well-scoped change, let Codex inspect, implement, and verify without requiring a separate approval for each step. Pause for decisions and inspect the result where it matters.

Evaluate speed as elapsed time to an accepted, verified result plus your review and correction effort. This session contains no controlled Codex-versus-Claude comparison, and the instruction-size reduction does not prove a speed improvement. Your experience can be positive without making that causal claim.
