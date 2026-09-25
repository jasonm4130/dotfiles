# Codex work loop: design and trial

Use an Astra orchestrator, Terra or Sol implementers, a focused Astra advisor,
and a fresh Astra reviewer for substantial local code work. The first version
uses Codex's existing runtime and personal profiles. It does not replace
Nightwatch's persistent queue, recovery, or unattended budgets.

This note records the evidence behind the design and the acceptance trial for
Jason's transition from Claude. Model choices are provisional until measured on
his own work; none of the sources establishes this exact combination as best.

## Prior art and the decisions it supports

| Source | Evidence and limit | Design decision |
|---|---|---|
| [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Describes orchestrator/worker and evaluator/optimizer patterns; advises simple composition and environment feedback. It is design guidance, not a comparative benchmark for these models. | Use profiles and a skill before a custom engine. Ground acceptance in actual checks. |
| [Anthropic: multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system) | Its production account emphasizes clear delegation boundaries, compressed evidence, scale proportional to the task, and evaluations. Research parallelism is not equivalent to shared-code implementation. | Keep the main context focused; give workers explicit ownership and acceptance. Parallelize independent work only. |
| [Kim et al.: Scaling Agent Systems](https://arxiv.org/html/2512.08296v1) | Studies 180 configurations across four benchmarks and finds task-dependent coordination benefit and overhead. The tested tasks and models do not establish performance on transcoder. | Begin with one implementer and selective advice; measure repair rounds and coordination cost. |
| [Claude Code advisor](https://code.claude.com/docs/en/advisor) | Provides an integrated stronger-model consultation during execution. | Reproduce the consultation contract, not an unsupported promise of identical server-side context or caching. |
| [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) and [profiles](https://learn.chatgpt.com/docs/config-file/config-advanced) | Support explicit model/effort, separate sessions, personal profiles, and orchestration. Children inherit runtime permissions; configuration alone is not proof of active enforcement. | Use explicit models; fresh review contexts; verify startup configuration. Use CLI read-only profiles when that boundary is needed. |
| [Pi extension API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) and [subagent example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/subagent/README.md) | Provide custom tools, event interception, persistent state and example single/parallel/chain delegation. Exact Astra/Sol/Terra account access has not been exercised here. | Keep Pi as an alternative if custom workflow UI or runtime controls become a measured need. Do not migrate merely to recreate existing delegation. |

## Specification

Ordinary launches load the work-loop instructions and worker defaults from the
global config. The `work` profile remains an explicit alias.

Create five personal profiles: `work` (Astra orchestrator), `work-terra`,
`work-sol`, `work-advisor`, and `work-review`. Keep the existing `review`
profile unchanged for compatibility. All roles start at medium effort.

Install a discoverable `work-loop` skill globally and update the Codex-only
code-work conventions to point to it. Manage the files in chezmoi and apply
only these targets with `chezmoi apply --include=files`; do not reconcile
unrelated home configuration or hook trust. No packages or API keys are needed.

One implementer owns a unit. It returns DONE, NEEDS_ADVICE, or BLOCKED with
observed checks and repository identity. The orchestrator routes a concrete
question to a fresh advisor and returns its answer. A separate reviewer receives
the requirements and diff, excluding the advisor discussion and author's quality
claims. A failed repair on the same uncertainty causes escalation, not repetition.

The profiles and skill define behavior; they are not a deterministic workflow
scheduler. Native tools are used when they expose the required model/role controls.
CLI profiles provide a portable fallback and preserve Sol's CLI convention.
Workers do not create recursive agent trees. Read-only CLI advisor/reviewer
sessions return permission blockers rather than bypassing the sandbox.

## First acceptance trial

Repair transcoder's formatting wrapper, which currently exits 0 when Cargo
fails without a recognizable diff. This was reproduced against main at
`0b37cf6` using a temporary failing Cargo executable.

Use an isolated branch/worktree and preserve the existing two untracked review
reports in the primary checkout. Assign implementation to Terra. Deliberately
exercise one advice handoff about distinguishing ignored generated diffs from
real execution failure, then ask a fresh Astra reviewer to inspect the change.
Assign independent regression tests to Sol in a separate worktree. Do not
fabricate an escalation or relabel a smoke test as proof of implementation quality.

Required behavior: clean formatting passes; ignored generated-binding-only diffs
pass; tracked formatting differences fail; failed Cargo/tool/parser execution
fails even when output has no diff or includes ignored-file differences. The
regression checks must execute the actual wrapper, with a red control against
the original file. Run the wrapper with real Cargo afterward. Do not broaden
into unrelated formatting changes, media behavior, or global hook repairs.

Record actual selected models/permissions, session IDs, advisor question,
review findings and resolution, observed check output, elapsed time and allowance
snapshots. Validate the skill and profile parsing. A happy-path pass does not
prove cancellation, restart recovery, unattended operation, or superiority to
single-agent work. Those remain later acceptance items.

## Runtime results

Installed all five profiles and the skill through scoped chezmoi application.
The installed skill validator returned `Skill is valid!`; real prompt construction
loaded the orchestrator and worker instructions. Live CLI sessions accepted
`--strict-config` and recorded these runtime identities:

| Role | Observed execution |
|---|---|
| Implementation | Native Terra, medium, isolated `fix/fmt-gate-fail-closed` worktree |
| Tests | CLI Sol, medium, workspace-write, separate test worktree; session `01a07688-aebf-7820-af52-83a8a203af50` |
| Advice | CLI Astra, medium, read-only, approval never; session `01a07689-a99e-7e51-b23a-7f77abc7be12` |
| Review | Fresh CLI Astra, medium, read-only, approval never; session `01a0768e-2dd7-7c41-9554-74fe77dab643` |

The advisor corrected the proposed rule to reject every nonzero Cargo status:
ordinary formatting differences also return 1. It recommended accepting only
positively identified ignored-binding diffs. The first implementation still
accepted such diffs with exit status 2. Both the orchestrator's execution probe
and the independent reviewer found that hole. One repair preserved Cargo's
status and limited the exception to 1. Sol added statuses 2 and 101 plus silent
failure coverage. The reviewer then reported: “No material issue remains in
the repair, new coverage, or CI registration.”

Observed acceptance results:

- Original wrapper: `pass 3`, `fail 5` with the final eight-case suite.
- Repaired wrapper: `pass 8`, `fail 0` using `node --test scripts/fmt-check.test.mjs`.
- Real repository execution: `real repository fmt gate exit=0`.
- Real Cargo mixed diff/parser-error fixture: `Cargo exit=1, stdout has Diff=True, stderr has error=True, gate exit=1`.
- Shell and Node syntax checks and `git diff --check` passed.
- The existing Node-enabled CI job now runs the regression suite; remote CI
  has not been executed for this branch.

Sol resumed by exact session ID and retained its model, effort, sandbox and
checkout in the subsequent runtime record. The read-only reviewer could inspect
and run syntax checks, but its fixture creation failed with EPERM; the
orchestrator executed those tests and supplied logs. This is evidence of the
observed boundary, not an exhaustive sandbox audit.

The first CLI worker started at 11:44 UTC and the final allowance snapshot was
11:58 UTC on September 6. The account's Codex window moved from 7% used before
the trial to 9% used afterward (91% remaining). These aggregate, rounded readings
include concurrent session activity and are not per-model costs or a benchmark.

This trial exercised implementation, advice, independent tests, fresh review,
one repair, and session resume. Cancellation, crash recovery, unattended
operation, and comparative model quality remain untested. The workflow is ready
for supervised local use; further transcoder work should provide those measurements.

1Password readiness was confirmed with the updated `op vault list` probe outside
the sandbox. The earlier `op whoami` failure was a wrong readiness test, not
evidence that the user's vault was locked.
