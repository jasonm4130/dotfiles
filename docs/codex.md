# Codex operation and verification

Jason's interactive baseline is Astra at medium effort, authenticated with
ChatGPT Pro 20×. The global protections below are active and tested. Claude's
project guards and Nightwatch are not yet a working Codex workflow; use the
compatibility table before resuming unattended work.

## Daily use

Start `codex` in the project's directory. Use `codex --profile review` for
Terra medium in a read-only session. The review profile does not run reviews
automatically. Sol remains an explicit escalation, not a background default.

Run `codex-usage` for the account's reported remaining allowance and reset times.
Use `codex-usage --json` for structured output. This command starts Codex's
documented app-server account read, never a model request. A failed read is an
error, not a zero-usage result. Bucket identifiers do not establish which model
uses each bucket. Percentages may be rounded.

The CLI footer now includes available primary and weekly allowance fields.
The live picker displayed `weekly 99% left` during verification. A field can be
omitted when the server does not return the corresponding window. `/statusline`
changes the footer; `/usage` opens the native usage interface.

Keep 25% reserve as an initial operating policy for optional background work.
Measure actual allowance before and after representative tasks. This is not an
enforced quota guard or a guarantee that an in-flight task cannot exhaust the
allowance. No credits, paid API fallback or unattended runs were enabled.

## Ownership and persistence

`dot_codex/private_config.toml.tmpl` manages model, effort, approval reviewer and
the `CLAUDE.md` fallback. It preserves other live settings, including hook trust,
project trust, UI choices and integrations. New machines get quota footer
defaults; existing footer choices survive. The rendered config remains mode
0600. Changing a preserved setting happens through Codex, not by deleting a
source entry which the template will recover from the live file.

This split fixes a measured failure: the old flat source would delete the
trusted hook hashes written by Codex, disabling hooks on the next apply.
Trust is deliberately machine-local; hashes are not committed as universal
approval. New or changed hook definitions need `/hooks` review on each machine.

`dot_codex/hooks.json` owns four global hooks. The scanner and disk/instruction
scripts remain at their existing shared locations; their `.claude` names do not
mean they run through Claude. Keep those files when retiring Claude Code.
The Go scanner is built by the existing chezmoi build script on normal applies.
This activation used a targeted build to avoid running unrelated apply scripts.

Herdr owns its generated integration script. After updating it with
`herdr integration install codex`, reconcile the generated script and hook
entry into dotfiles, as already done for the Claude integration.

The writing skill is a chezmoi-managed symlink from
`~/.agents/skills/writing-artifacts` into the claude-skills checkout.
It has one source and its adjacent resources remain available. A new machine
needs that checkout at `~/Work/Git/claude-skills` before using the skill.

## Verified on September 6, 2026

| Surface | Actual evidence | Scope |
|---|---|---|
| Astra runtime | `ASTRA_RUNTIME_OK`; startup named `gpt-6-astra`, medium | One minimal real subscription request |
| Terra profile | `TERRA_REVIEW_OK`; startup named `gpt-5.6-terra`, read-only, approval never | One minimal real request |
| Project instructions | Fresh transcoder session reported `cargo nextest run --workspace` and process-global test isolation | `CLAUDE.md` fallback loaded; no project tests run |
| Shared conventions | Same session read `~/.ai/codex-code-work.md` and reported the Terra review convention | Explicit lazy loading works |
| Secret scanner | `hook: PreToolUse Blocked`; filesystem check: `PASS: clean edit exists; synthetic-secret file was not created` | Clean and synthetic-secret `apply_patch` calls in a real session |
| Disk guard | `cargo --version` allowed; `cargo build --help` blocked at an artificial threshold | No actual build or low-disk condition required |
| Instruction-size advisory | `review instruction size: 32627B > 24576B local review threshold (not a measured context truncation)` | Real patch and model-visible PostToolUse feedback |
| Writing skill | Runtime read the linked SKILL.md and returned its document-level principle | Discovery and actual loading, not an artifact-quality benchmark |
| Herdr | `codex: current (v8)`; socket test checked `pane.report_agent_session` and correct pane/session | Synthetic local socket; actual pane restoration not exercised |
| Hook trust | Final check returned `HOOK_TRUST_PRESERVED`, `pass: true`, all four hooks trusted, empty errors/warnings after another chezmoi apply | No permanent trust bypass configured |
| Quota command | JSON returned the `codex` weekly window at 1% used at 20:11 Brisbane | Account observation, not a per-task billing attribution |

The scanner regression first produced
`Codex patch with synthetic secret: expected deny JSON on stdout, got none`.
Adding the Codex `tool_input.command` case made the suite return
`ok  claude-hooks  1.011s`. Missing patch content now denies rather than silently
accepting an unscanned patch.

The first size-hook integration test also exposed a semantic error: the shared
Claude guard claimed a Codex MEMORY.md was truncated at Claude's cap. The new
`codex-hook` mode reports local byte thresholds only. Claude's existing mode
retains its own behavior; the combined regression run returned `pass 8`,
`fail 0`. Advisory thresholds are not enforced context limits.

Other executed suites returned `pass 24`, `fail 0` for disk/instruction/config
tests, `pass 24`, `fail 0` for title/fanfare tests, and `pass 7`, `fail 0` for
each of ambient's and claude-skills' project-hook suites. Existing tests used
isolated fixtures; the migration did not reclaim real worktrees or build caches.
These suite results do not establish Codex integration for unmigrated hooks.

Final diagnostics returned `19 ok | 1 idle | 0 warn | 0 fail ok`.
The scoped `chezmoi diff` and `git diff --check` returned no output.

## Compatibility audit

| Existing component | Result and next action |
|---|---|
| Secrets scanner | Adapted and active. Pattern scanning is not comprehensive secret detection; hosted calls and interactive stdin are outside this hook's complete coverage. |
| Disk guard | Active in `pretool` mode only. Automatic reclaim was not enabled. |
| Instruction guard | Active in `codex-hook` mode, with Codex-specific advisory wording. |
| Herdr session state | Native Codex v8 installed and tested against a socket fixture. Test pane restoration in a real Herdr workspace when using it. |
| Claude session primer | Not copied: it also lists global Claude plan files, which could inject unrelated work. Codex uses the migration resume pointers and project instructions. |
| Claude PreCompact hook | Not copied: it writes Claude's compaction log and claims its checkpoint is the only durable trace. That claim does not describe Codex history. |
| Stay-awake wrapper | Not imported as an every-session background process. Use an explicitly scoped `caffeinate` for an authorized long terminal run. |
| Claude title/fanfare/statusline | Tests pass for Claude. Codex uses its native title/footer; Claude's `terminalSequence` and Notification event were not assumed compatible. Custom voice clips were not ported. |
| Transcoder nextest guard | Direct payload tests returned deny for blanket workspace serialization and allow for nextest. Not installed in Codex project scope yet. |
| Transcoder PR-base guard | Direct test returned `ask`. Codex documents `ask` as unsupported and fail-open for PreToolUse; port the decision semantics before enabling. No PR was created. |
| Ambient and claude-skills project guards | Seven tests passed in each repo. Existing settings are Claude-only; Codex project activation remains necessary, including coverage of new `.codex/` configuration paths. |
| gates/ship-gate/retro | Not imported. Their Claude state, hook outputs and worker routing require a deliberate port. Do not interpret plugin names in old instructions as installed Codex capabilities. |
| ADR/domain-modeling/Nightshift skills | Writing was portable and installed. ADR routes into `nightshift:plan`; keep that dependency explicit rather than installing a broken entry point. |
| LSP plugins | Claude registrations do not provide a Codex LSP tool. The adapted convention uses LSP when exposed and targeted search otherwise. |
| Custom MCP services | `codex mcp list` returned `No MCP servers configured yet.` Chrome, Cloudflare docs, Tavily, social and claude-design were inventoried, not connected or exercised in Codex. Built-in app tools are separate. |
| Installed Codex plugins | CLI inventory lists plugin-management 0.1.0, openai-templates 0.1.1 and deep-research-work 0.1.14, enabled. Their external account actions were not exercised. |
| Nightwatch | Launcher still uses `claude -p` and Workflow with Opus/Sonnet phases. A runtime port, not a model substitution; no overnight workload launched. |
| wattop | Dollar estimates remain distinct from subscription allowance. Existing QA and runtime-storage support need a separate ai-dashboard session. |

The primary references are [Codex hooks](https://learn.chatgpt.com/docs/hooks),
[profiles](https://learn.chatgpt.com/docs/config-file/config-advanced),
[skills](https://learn.chatgpt.com/docs/build-skills), and
[usage](https://learn.chatgpt.com/docs/pricing). The config template uses chezmoi's
[include](https://www.chezmoi.io/reference/templates/functions/include/) and
[fromToml](https://www.chezmoi.io/reference/templates/functions/fromToml/).

## Next project sessions

Use the [four resume points](codex-migration-2026-09-06.md#project-resume-points).
For each repository, first migrate its guard configuration with safe deny/allow
fixtures and trust its hooks. Then resume the project task. Keep Nightwatch's
runtime port in claude-skills; preserve its independent verification, queue,
resume and no-push/no-merge contracts. This is required before treating Codex
as a replacement for the overnight workflow after September 25.
