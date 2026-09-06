# Codex operation and verification

Jason's interactive baseline is Astra at medium effort, authenticated with
ChatGPT Pro 20×. Global protections and daytime project guards are active and
tested. Native memory recall is still pending consolidation. Nightwatch is not
yet a working Codex workflow; use the compatibility table before unattended work.

## Daily use

Start `codex` in the project's directory. Use `codex --profile review` for
Terra medium in a read-only session. The review profile does not run reviews
automatically. Sol remains an explicit escalation, not a background default.

Resume saved work with `codex resume` (project-filtered picker),
`codex resume --last`, or `codex resume --all` (all directories).
Use `codex resume <session-id-or-name>` for a specific chat. Inside Codex,
`/resume` opens the picker and `/rename` gives a chat a recognizable name.
Use `/fork` to branch a conversation without replacing the original.
Resume restores saved conversation history; it does not depend on cross-session
memory consolidation. Ephemeral verification sessions are not saved for resume.
These controls were checked against installed CLI help and the
[CLI command documentation](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

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
the `CLAUDE.md` fallback, plus native memory enable/use/generation and its 25%
remaining-quota threshold. It preserves other live settings, including hook trust,
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

## Memory and setup iteration

Native local memory is enabled. It is separate from ChatGPT web memory.
Use `/memories` for per-chat controls. Generation happens in the background;
required rules still belong in AGENTS.md or repository documentation.
See [memory controls](https://learn.chatgpt.com/docs/customization/memories).

The selective migration covers transcoder, ambient, claude-skills and
ai-dashboard. Four curated, project-scoped summaries replace the raw imported
input; Claude's originals remain untouched. The raw import is archived at
`~/.local/state/codex-memory-migration/2026-09-06/imported-originals/`.
The active resources live below
`~/.codex/memories/extensions/external_agent_import/resources/`.
Do not bulk reimport over this curation or sync generated memory into dotfiles.

CLI 0.153.4 required `features.external_agent_memory_import=true` for its import
detector. That flag was process-local, not persisted. The native import returned
four MEMORY successes and `failures: []`; no settings, hooks, skills or chats
were imported. File import alone did not pass fresh-session recall: the first
test returned `MEMORY_NOT_LOADED`, requiring consolidation into the native index.

The raw archive was compared byte-for-byte with Claude's current files:
`CLAUDE_ORIGINALS_MATCH_ARCHIVE: 144 files`. Active curated input contains only
four scope.json/MEMORY.md pairs: `CURATED_MEMORY_INPUT: 4 projects, 5813 bytes`.
Curated seeds are also retained under the archive's sibling `curated/` directory.

Ordinary Codex sessions restrict memory writes to `extensions/ad_hoc/notes/`;
they do not own generated root indexes. A native-session note write succeeded:
`Created extensions/ad_hoc/notes/2026-09-06-migration-ready.md (2298 bytes; four explicit project scopes).`
The migration also supplies a scoped provenance note in that directory.
No scheduler database or generated index was manually modified. Automatic
consolidation remains to be observed; do not mistake import success for an
end-to-end background-learning result.

A second fresh ai-dashboard session allowed native memory-file lookups but no
repository, Claude or web reads. It read the root registry and again returned
`MEMORY_NOT_LOADED`. At the end of this pass the scheduler's only consolidation
record remained `done` at 10:41:41 UTC, and the registry still reported no
consolidated evidence. Immediate recall is therefore not working yet. Retry the
same three-fact check after normal eligible sessions have had time to consolidate;
do not promise that merely reopening a session will fix it. The explicit project
handoffs remain the current reliable continuation route.

Final config reads confirmed memory enable/use/generation and threshold 25;
all four global hooks remained enabled and trusted, with empty errors/warnings.
Config and hook regression tests returned `pass 5`, `fail 0`. The socket fixture
first hit sandbox `EPERM`; the same suite passed with local socket access.
The live config remains mode 0600. Later runtime additions to project trust were
preserved; a subsequent chezmoi diff showed only their formatting normalization.

The [setup audit](codex-setup-audit-2026-09-06.md) records the practitioner
comparison and a task-based improvement workflow. The baseline is not a proven
optimum. The [daytime follow-up](codex-followup-2026-09-06.md) records the guard
policy and browser checks. Nightwatch remains a separate readiness gate.

## MCP connections

Two documentation servers are enabled through the chezmoi config template.
New entries are seeded only when absent; subsequent local customization,
including `enabled = false`, survives apply. No credentials or packages are
needed for these connections. Removing an entry entirely causes the template
to seed it again; disable it explicitly instead.

| Server | Endpoint | Runtime verification |
|---|---|---|
| OpenAI Developer Docs | `https://developers.openai.com/mcp` | `connected`; five tools; `search_openai_docs` returned results and `fetch_openai_doc` returned `# Slash commands`. |
| Cloudflare docs | `https://docs.mcp.cloudflare.com/mcp` | `connected`; two tools; `search_cloudflare_documentation` returned `https://developers.cloudflare.com/workers/wrangler/commands/workers/`. |
| Chrome DevTools | Cached `npx --offline --yes chrome-devtools-mcp@1.8.0` | `connected`; synthetic DOM returned `CHROME_DOM_OK`; test tab closed. |

The checks used Codex app-server's actual MCP client, not just HTTP reachability
or config parsing. No model calls were needed. `codex mcp list` labels these
servers' auth as `Unsupported`; both nevertheless connected and answered tools
without credentials. That label is not a startup-failure verdict.

Restart the local Codex client after configuration changes, then use `/mcp`
to inspect active connections. Use `codex resume` when restarting to continue
saved work. Existing sessions do not acquire new tools merely because a file
was edited. See [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp),
[OpenAI Docs MCP](https://developers.openai.com/learn/docs-mcp), and
[Cloudflare's Codex setup](https://developers.cloudflare.com/agent-setup/codex/).

Other Claude connections were assessed, not silently copied:

- Chrome DevTools now uses `--isolated --headless --no-usage-statistics
  --no-performance-crux`. It does not attach Jason's signed-in browser. The
  pinned package must exist in the npm cache; offline startup will not download it.
- The social MCP returned `social MCP HTTP 401` to an unauthenticated initialize
  request. It needs a separate Codex login/access decision. Claude tokens were
  not read or copied; no social account tool was called.
- Tavily remains unconfigured to avoid adding paid-search credentials alongside
  native web search without a demonstrated need. No Tavily query was made.
- Claude Design remains unconfigured. Its Anthropic endpoint and Claude-side
  authentication are not evidence of an authorized Codex connection.

The updated config/hook test suite verifies seeding, custom-server preservation,
runtime trust preservation, idempotent rendering and the existing hook fixtures.
It returned `pass 6`, `fail 0`; scoped chezmoi diff and Git whitespace checks
returned no output.

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
| Transcoder nextest guard | The trusted daytime dispatcher invokes the existing guard. Fixture checks allow nextest and deny blanket workspace serialization. |
| Transcoder PR-base guard | Daytime policy denies non-main PRs and asks the agent to seek Jason's confirmation. A native Codex probe was blocked. Confirmed exceptions are run by Jason, not by disabling the guard. |
| Ambient and claude-skills project guards | Daytime policy is active by Git remote. Native status/deny probes passed in both repositories. Tests cover staged test removal; ordinary commits and merges remain allowed. Overnight guards are unchanged. |
| gates/ship-gate/retro | Not imported. Their Claude state, hook outputs and worker routing require a deliberate port. Do not interpret plugin names in old instructions as installed Codex capabilities. |
| ADR/domain-modeling/Nightshift skills | Writing was portable and installed. ADR routes into `nightshift:plan`; keep that dependency explicit rather than installing a broken entry point. |
| LSP plugins | Claude registrations do not provide a Codex LSP tool. The adapted convention uses LSP when exposed and targeted search otherwise. |
| Custom MCP services | OpenAI docs, Cloudflare docs, and isolated Chrome are connected and tool-tested. Tavily, social and Claude Design remain unconfigured. Built-in app tools are separate. |
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
Resume daytime project tasks with the trusted guard and the documented memory
handoffs. Test native memory recall after consolidation. Keep Nightwatch's
runtime port in claude-skills; preserve its independent verification, queue,
resume and no-push/no-merge contracts. This is required before treating Codex
as a replacement for the overnight workflow after September 25.
