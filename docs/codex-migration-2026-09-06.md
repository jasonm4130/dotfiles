# Claude Code to Codex migration

The baseline is now activated. See [Codex operation and verification](codex.md)
for the tested hooks, fixes, quota command and remaining compatibility gaps.
The discovery observations below retain their original inspection scope.

Jason and future project sessions use this record to choose the harness, apply
the baseline, and locate unfinished work. Start with Codex and Astra medium.
Keep pi for the existing local-model experiments. ChatGPT Pro 20× is the primary
budget; Jason has scheduled Claude Max 20× to become Pro on September 25, 2026.

## Decision and acceptance criteria

Codex is the first migration target because its documented import, hooks,
skills, plugins and project instructions match the current setup's components.
Pi is a viable subscription client, but requires evaluating extensions for this
workflow. This is a migration-cost judgment, not a measured model-quality win.
Reconsider pi if a concrete Codex limitation blocks accepted work.

The baseline must preserve live Codex choices in chezmoi, load code conventions
and existing project CLAUDE.md files, offer a cheaper explicit reviewer, and
provide four verified resume points. Full migration additionally requires
proving the important hooks and skills in a real Codex session and replacing
Nightwatch's Claude Workflow dependency. The baseline does not establish that
those latter components work.

Official references: [import](https://learn.chatgpt.com/docs/import),
[profiles](https://learn.chatgpt.com/docs/config-file/config-advanced),
[instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[hooks](https://learn.chatgpt.com/docs/hooks),
[models](https://learn.chatgpt.com/docs/models), and
[usage](https://learn.chatgpt.com/docs/pricing).
Pi's [provider documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)
documents ChatGPT Plus/Pro login; its
[README](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)
describes the extension-based harness.

## Observed setup

Read-only discovery on September 6 returned `codex-cli 0.153.4`, pi `0.84.3`,
and `Logged in using ChatGPT`. These establish installation and sign-in,
not an inference test or remaining allowance. Codex printed a sandbox warning:
`WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)`.

`codex --strict-config doctor --summary --ascii` failed its connectivity checks
inside the network sandbox. The approved rerun outside that sandbox returned
`19 ok | 1 idle | 0 warn | 0 fail ok`, including configuration, authentication,
HTTP and WebSocket checks. This checked the live configuration before activation.

The documented `account/rateLimits/read` endpoint returned `usedPercent: 0`
for every returned window at `2026-09-06T10:01:32.640Z` (20:01 Brisbane).
The returned buckets were `codex_bengalfox`, `base_model_inference`, and `codex`;
their names do not establish a model mapping. Do not interpret integer zero
as proof of no consumption. No model request was sent by that probe.

| Component | Observed state | Migration treatment |
|---|---|---|
| Shared instructions | `dot_ai/AGENTS.md` renders to Claude and Codex | Keep one source and existing fences |
| Code conventions | `Work/Git/CLAUDE.md` contains Claude-specific routing | Adapt into `dot_ai/codex-code-work.md`; load explicitly for code work |
| Codex defaults | Live Astra medium, auto-review and trust entries; source still Terra | Preserve live values in source; add project CLAUDE.md fallback |
| Routine reviewer | codex-review README says explicit Terra; scripts need runtime validation | Add `review.config.toml`; keep background callers explicit |
| Claude model | `claude-fable-5-1[1m]`, high effort, Opus advisor setting | Do not translate advisor or effort rules mechanically |
| Claude workers | Sonnet worker and Explore definitions | Port role intent only when delegation is needed |
| Hooks | secrets scan, disk guard, primer, instruction guard, compaction, titles/sounds, herdr | Review payload compatibility and trust before enabling |
| MCP registrations | chrome-devtools, claude-design, cloudflare-docs, social, tavily | Registration is not connection health; port only required services |
| Plugins | gates, ship-gate, Nightshift, review, retro, ADR, writing, domain modeling, LSP, context7 | Import selectively and test; handoff plugin is disabled |
| Pi | Local MLX Qwen3.8 27B default at localhost:8080 | Preserve experiment; no OpenAI inference was tested through pi |
| Secrets | 1Password/op-fast plus existing Keychain-backed MCP launchers | Preserve references; do not copy credentials into dotfiles |

Codex's project instruction discovery starts at the repository root. Merely
placing an AGENTS.md above separate Git repositories does not establish that
the conventions load. The global Codex-only pointer solves that explicitly;
the CLAUDE.md fallback handles instructions inside each repository.

## Baseline specification

The initial baseline source changes were `dot_codex/config.toml` (now
`dot_codex/private_config.toml.tmpl`),
`dot_codex/review.config.toml`, `dot_ai/AGENTS.md`,
`dot_ai/codex-code-work.md`, and this record. Preserve the live trust entries and
auto-review setting. Leave model speed and experimental features at their
existing defaults. The review profile selects Terra medium with read-only
sandboxing and no approval prompts; it does not run a review automatically.

Preview only the named targets with `chezmoi diff`. Apply only named files using
`chezmoi apply --include=files`, then execute `~/.ai/render.sh` to regenerate
the existing instruction destinations. Do not run an unrestricted apply:
it can execute unrelated hooks or reconcile unrelated drift.

After activation, validate strict config loading and run a small real Codex
session. Verify the selected model/profile and loaded instruction sources.
A successful parser or doctor result alone does not prove model availability,
guidance adherence, hook enforcement, or successful project execution.

## Usage policy to calibrate

No harness setting guarantees never reaching plan limits while allowing
unbounded work. Use Astra medium for judgment-heavy interactive work and Terra
for clear, bounded work. Use a more expensive setting only for an observed need.
Keep a single background workload initially and avoid default review fan-out.

Record remaining allowance and reset times before and after representative
sessions using the account's usage display. Reserve 25% of each applicable
allowance for interactive work as an initial operating policy, not a documented
OpenAI limit. Stop launching optional background work when that reserve is
reached; an in-flight task can still overshoot. Before unattended execution,
implement admission checks, bounded units and a stop policy using measured
allowance. Do not silently buy credits or fall back to API billing.

The latest claude-skills root transcript contained 507 unique assistant message
IDs on September 6 Brisbane time, with 108,202,105 cache-read tokens and 297,345
output tokens. This bounded sample excludes subagents and other transcripts.
It demonstrates a large workload; it cannot predict ChatGPT quota consumption.
The ai-dashboard limitations file explicitly says its dollar estimates are not
subscription billing. Measure subscription usage separately.

## Project resume points

These are local observations, without fetching remotes or retesting old claims.
Each project session must check the current branch, changes and relevant target
before executing the work. Historical assistant summaries are hypotheses.

### transcoder

Primary checkout: `~/Work/Git/transcoder`, main at `0b37cf6`.
`git status --short` reported `?? docs/research/2026-09-06-gap-analysis.md`.
Preserve that untracked report. Read it and `CLAUDE.md` before choosing work.
The report's findings have not been reproduced in this migration session.

Nightwatch specs live in `~/.local/state/nightwatch/transcoder/specs/`;
seven named specs were present, plus a separate plumbing dry-run record.
Read the journal and `~/.claude/projects/-Users-jasonmatthew-Work-Git-transcoder/memory/nightwatch-transcoder-setup.md`.
Verify clone, queue and running processes before restarting anything.
The latest research transcript is `f482bb1c-6d00-4fc9-8e82-4e0479225e8c.jsonl`
under that Claude project directory.

### ambient

Primary checkout: `~/Work/Git/ambient`, main at `e5e2de5`, clean in this inspection.
The completed night is in **`~/Work/Git/nightwatch/ambient`**, branch
`nightwatch/2026-09-05`, HEAD `f6acc6d`.
`git rev-list --count origin/main..HEAD` returned `38`.
That compares the local remote-tracking ref, not a freshly fetched remote.

Read `~/.local/state/nightwatch/ambient/journal.md` and inspect the branch diff.
The prior session reports six landed outcomes and says the generated
`pr-body.md` covers only the final WER run. Check and rewrite the PR body for
the entire branch before publication. The migration did not push or open a PR.
The relevant morning summary is in the claude-skills transcript below;
the latest ambient root transcript is older and discusses CI costs.

### claude-skills

Checkout: `~/Work/Git/claude-skills`, main at `397bf28`, clean in this inspection.
The latest commit is PR #117, Nightshift 0.1.9 verifier bookkeeping.
Read `docs/research/2026-09-05-nightwatch-first-night.md`, the Nightwatch plans,
and `plugins/nightshift/nightwatch/{run.sh,nightwatch.mjs}`.

The launcher invokes `claude -p`; its prompt requires `Workflow`, with Opus and
Sonnet phases in the script. Replacing a model string cannot port that runtime.
A Codex port must preserve state, bounded units, independent verification,
test restrictions, resume behavior and the no-push/no-merge invariant.
Implement this as separate project work before the September 25 downgrade.
Do not edit the running plugin cache or start an overnight run during setup.
The latest root transcript is `a67c55f8-f689-467a-8902-a8042462f5b2.jsonl` in
`~/.claude/projects/-Users-jasonmatthew-Work-Git-claude-skills/`.

### ai-dashboard / wattop

Checkout: `~/Work/Git/ai-dashboard`, main at `5a6664a`, clean in this inspection.
Read `docs/limitations.md`, `docs/manual-qa.md`, and
`docs/qa/2026-09-06-v0.1.md`. Current documentation records the narrow detail
view defect, startup measurement issues, and estimated dollar accounting.
The migration did not rerun its build, tests or UI QA.

The existing memory is
`~/.claude/projects/-Users-jasonmatthew-Work-Git-ai-dashboard/memory/wattop-next-steps.md`;
the transcript is `28cd1f81-b6ba-4896-aa1d-2a79715d058a.jsonl` in its parent project
directory. A later session can use the real snapshot command recorded there.
Quota displays and support for current Codex session storage are relevant next
work, but need a fresh reproduction before changes.

## Remaining migration passes

Use Codex's import UI selectively for recent chats, memories and reusable skills.
Review generated settings against the chezmoi baseline before accepting them.
Import is documented, but was not exercised here. Do not duplicate the shared
instructions or enable every old plugin automatically.

Prove the secrets guard first using a synthetic credential in a disposable
fixture. Codex hooks require reviewing and trusting their definitions; test
the actual tool payload and block result, not just the standalone scanner.
Next port project invariants, useful primers and notifications. Only then
carry the surviving workflows into a Codex plugin or shared skills directory.

Use a bounded task from each project to assess outcomes, repair rounds and
allowance consumed. Keep test/build observations separate from historical
summaries. Schedule the Nightwatch port as its own claude-skills task; the
interactive baseline is not permission to launch or replace overnight work.
