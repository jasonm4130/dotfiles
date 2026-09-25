---
name: work-loop
description: Orchestrate substantial local code work with Astra planning and review, Terra or Sol implementation, and focused Astra advice. Use for delegated implementation, multi-agent coding workflows, or an explicit work-loop request. Keep trivial edits in the main thread.
---

# Work loop

Deliver a tested change while keeping the main conversation focused on decisions.
Use native Codex delegation where the exposed tools support explicit model selection;
use the installed CLI profiles otherwise. This is an interactive workflow, not an
unattended queue engine or a replica of Claude's server-side advisor.

## Route the work

| Role | Model and effort | Use |
|---|---|---|
| Orchestrator | Astra medium | Scope, work allocation, advice routing, integration and acceptance |
| Worker | Terra medium | Bounded fixes with a clear acceptance check |
| Worker | Sol medium, via Codex CLI | Ambiguous implementation or changes spanning modules |
| Advisor | Astra medium | A specific unresolved decision during implementation |
| Reviewer | Fresh Astra medium | Independent assessment of the completed change |

These are starting choices, not a measured quality ranking. Escalate effort only
for demonstrated uncertainty. Small mechanical work can stay with the orchestrator.
For substantial delegated changes, use one implementer initially. Add parallel
workers only for independent ownership and useful concurrent work. Keep a slot
available for advice. Never delegate merely to make every role appear in a trace.

## Prepare a bounded assignment

Read applicable repository instructions and verify reported defects against the
current tree. Record the objective, acceptance criteria, repository/worktree,
branch and base SHA, allowed files, invariants, test commands, and excluded actions.
Use the repo's plan location for persistent decisions; a temporary run directory
can hold logs. Preserve pre-existing work and name its owner when known.

Give concurrent implementers separate worktrees. Avoid concurrent Rust checks
against a shared target directory; serialize them or deliberately isolate their
build outputs. Record the actual target used. Do not infer that worktree separation
isolates build artifacts.

Before a long run, read the reported account allowance and follow the user's
secret-readiness policy. A failed allowance read means unknown, not free capacity.
Reserve 25% of each reported allowance as the local starting policy. At that
threshold stop optional delegation, preserve the handoff, and tell the user what
remains. This policy is not a hard quota limiter and percentages may be rounded.

## Worker contract

The worker verifies its checkout and assigned defect, implements within scope,
and runs the agreed checks. Return DONE, NEEDS_ADVICE, or BLOCKED with:

- Checkout, branch, base/current SHA and changed paths.
- What changed and why, with the patch available for review.
- Commands run, exit codes and decisive output; distinguish tests from inspection.
- Remaining uncertainty or an exact blocking dependency.

A NEEDS_ADVICE return includes the concrete question, the relevant paths/symbols,
observed failure, options considered, and the worker's current hypothesis.
The worker must not hide a failed check, relax acceptance to obtain green, or
start its own worker/advisor tree. Commit and external actions remain owned by
the orchestrator unless explicitly delegated.

## Consult without contaminating review

The orchestrator decides whether the question needs an advisor or simply missing
evidence. Start a fresh Astra advisor with the question and necessary code context.
Do not forward unrelated transcript history. The advisor returns a recommendation,
reason, and falsification check; the orchestrator forwards the advice and resumes
the same worker where possible. CLI workers can be resumed by their recorded
session ID after checking the current CLI's resume options.

Start with at most one advisor consultation per unit. If one repair still fails
for the same unresolved reason, escalate to Sol or Astra with the evidence instead
of repeating the loop. A new, different failure can justify another bounded step;
state why. A human decision remains with the user.

After implementation, give a NEW Astra reviewer the requirements, base SHA,
current diff/worktree, applicable invariants, and test artifacts. Exclude advisor
conversation and the author's self-review or claims of quality. Do not reuse the
advisor as the independent reviewer. Review the whole change once, then restrict
follow-up review to fixes or material new concerns.

The orchestrator verifies findings against the current tree before routing a
repair. Accept only when requested behavior, appropriate checks, and material
review findings are addressed. Green tests do not refute a reproducible defect.

## Invocation

Start an interactive orchestrator with `codex --profile work`, or invoke
`$work-loop` in an existing Astra session. Global profiles are `work-terra`,
`work-sol`, `work-advisor`, and `work-review`.

For CLI delegates, use the assigned checkout with `-C`, select the profile
explicitly, and save both JSON events and the final response in the run directory.
For example, with paths chosen for this run:

```sh
codex exec --profile work-sol -C /absolute/worktree --json \
  --output-last-message /absolute/run/worker-result.md \
  - < /absolute/run/worker-prompt.md > /absolute/run/worker-events.jsonl
```

On macOS, launch headless CLI workers, advisors and reviewers with
`caffeinate -i codex exec ...` (including `exec resume`), preserving the same
arguments and redirections. The assertion lasts for the command and releases
automatically on exit. Interactive Codex uses the managed
`features.prevent_idle_sleep = true` setting; the installed CLI did not acquire
that native assertion in a headless execution probe. For a long workflow outside
the interactive CLI, also keep its local test/build command under
`caffeinate -i <command>`. Let the display sleep; do not change system power settings.

A prompt provided as an argument needs `< /dev/null` for background execution.
Use the harness's async execution rather than a detached shell process, so the
orchestrator can inspect progress and cancel it. Never bypass hook trust or
sandboxing to make a delegate succeed. A noninteractive approval failure returns
to the orchestrator for the normal scoped approval path.

Native delegates must receive the same contract and explicit model/effort.
Use fresh context for a reviewer; never use a full-history fork for independence.
Some native harnesses do not expose the installed CLI profiles or per-child
sandbox selection. When read-only enforcement matters, use the CLI advisor/review
profile with an explicit `--sandbox read-only`; instructions alone are not a
permission boundary. Verify the actual startup model and permissions rather
than treating a requested profile as evidence. Sol means the Codex CLI here.

## Keep an observable handoff

Record the task, role/model/session IDs, consulted question and resolution,
review findings and their disposition, changed files, actual checks, elapsed time,
and allowance snapshots. Save remaining work if interrupted. Do not store secrets
or full unrelated conversations. Do not label one successful trial best-in-class
or infer model-specific cost from aggregate account windows.

A reusable setup is ready only after a real worker/advisor/reviewer trial. Cancellation,
restart recovery, and unattended operation require their own observations; do not
claim them from a happy-path test. The first trial may deliberately exercise advice,
but ordinary tasks should consult only when the question warrants it.
