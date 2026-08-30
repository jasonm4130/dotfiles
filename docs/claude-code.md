# Claude Code setup

How `~/.claude/` is configured by this repo. See [Scope](../README.md#scope) for what
lives here versus in the claude-skills marketplace.


Settings, hooks, agents, MCP config and sounds under `~/.claude/`. Run
`chezmoi managed | grep '^\.claude'` for the live list. Skills are **not** tracked here —
they come from installed plugins (see [Scope](#scope)).

## Guards

Two hot-path guards — `secrets-scan` and `lsp-first` — are
subcommands of one compiled Go binary at `~/.local/bin/claude-hooks`, built from
`dot_local/src/claude-hooks/` by `run_onchange_after_15-claude-hooks-build.sh.tmpl` on
every apply. A hook is spawned per matching tool call, so what costs is process start, not
the work: 21.1 ms of node boot against 2.9 ms compiled, 7.3×.

Nothing is committed pre-built, so there is no shipped artifact and no staleness hazard.
The trade is that a missing toolchain is **fatal** rather than a soft skip — a
`settings.json` pointing at a binary that was never built would leave every write unscanned
with no error anywhere.

Guards follow a protection/advisory split:

- **`secrets-scan` fails closed** — blocks writes it cannot scan, denying via
  `permissionDecision` JSON.
- **Advisory guards fail open** — `lsp-first`, `claude-md-guard`, `disk-guard`.

`lsp-first` additionally checks that the language server it would redirect you to actually
resolves on `PATH`, and stays silent when it does not. It was deleted once for "zero LSP
adoption" when the real cause was that rust-analyzer and tsserver were both dead, so every
nudge it emitted was unactionable.

`disk-guard` blocks only heavy `cargo` builds and only under 8 GB free, on the reasoning
that a wedged volume costs more than a refused build. `disk-guard.sh reclaim [--deep]`
frees space; `--deep` removes an agent worktree only when it is unlocked, clean, and at the
same sha as its remote — it once removed a live worktree 11 commits ahead.

`claude-md-guard` checks the *shape* of always-loaded instruction files, never their
quality: size against calibrated byte bands, `MEMORY.md` against the one mechanically
enforced cap (200 lines or 25 KB, whichever first, past which content is silently dropped),
dated incident narrative that belongs in a memory store, and `@`-imports (which buy no
budget — imported files load in full at launch). It counts **bytes, not lines**: this prose
runs 140–430 B/line, so a 200-line target spans 28 KB–86 KB. The 12 KB/24 KB bands are
calibrated to the working baseline and labelled in-file as derived, not as Anthropic
numbers. Run `claude-md-guard.sh sweep` for a tree-wide audit, `file <path>` for one, or
`drift` to ask chezmoi whether the rendered `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`
are stale. Never diff those against the source — the `codex-only`/`claude-only` fences mean
they are *supposed* to differ.

`json-config-guard` now lives in the [`gates`](https://github.com/jasonm4130/claude-skills)
plugin rather than here. It guards config files by *basename*, so it is useful to anyone
editing a `settings.json`, which puts it on the capability side of the boundary. The
guard it replaced here is removed rather than left in place: a hook present in both a
plugin and `settings.json` runs twice.

Both it and `claude-md-guard` match `Bash` alongside the write tools, because a `sed -i`,
heredoc redirect or `tee` rewrites a guarded file without Edit/Write ever being involved,
and a guard that watches only the write tools is simply off for those sessions. They match
any *mention* of a guarded filename rather than parsing shell redirection to work out what
was actually written: getting that subtly wrong silences the guard exactly when it matters,
whereas re-validating a file that was only read costs one parse.

## MCP servers

Global (user-scope) servers are reconciled into `~/.claude.json` by
`run_onchange_after_13-claude-mcp-servers.sh` (add-if-missing, so it never disturbs a
working server). Edit that script to add or remove one, then `chezmoi apply`.

The registered set is deliberately small. `tavily` is the only web-search server — its
crawl/map/extract have no built-in equivalent, whereas exa's search/fetch duplicated the
built-in `WebSearch`/`WebFetch`, so it was dropped. `cloudflare-docs` is registered
**directly rather than via the `cloudflare` plugin**, which shipped four more MCP servers
that were never authenticated (contributing only dead
`authenticate`/`complete_authentication` entries to tool search) and 13 skills totalling
43% of the whole skill-description budget, against a real footprint of one `wrangler.jsonc`.
Reinstall it the day a Workers project starts, rather than carrying it idle.

A server reporting `Needs authentication` is not necessarily dead — `social` is Jason's own
service and just needs `claude mcp login social`.

Servers needing an API key read it from the macOS Keychain at launch, not from the `op://`
env: an MCP server has no login shell or tty and could never answer a Touch ID prompt.
Seeding those Keychain entries is a deliberate one-time manual step per machine (the
command is in that script's header) — doing it during `chezmoi apply` would make the whole
chain depend on 1Password being unlocked at that moment. The cost is that an unseeded
server still registers and reports Connected, failing only on first use, so verify with
`security find-generic-password -a "$USER" -s <service> -w`.

## Statusline, sounds and environment

The statusLine is a compiled binary at `~/.local/bin/claude-statusline` (source:
[jasonm4130/claude-statusline](https://github.com/jasonm4130/claude-statusline) — clone and
`go build` it on a new machine; the bootstrap does not ship it).

The tab-title hook plays ElevenLabs voice clips on finish/needs-input (fanfare), falling
back to the Glass chime when no clips are generated.

`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` in the settings `env` block strips Anthropic and cloud
credentials from Bash, hook and MCP-stdio subprocesses — `secrets-scan` catches secrets on
the way out, the scrub caps what a subprocess can read. That block also pins
`TZ=Australia/Brisbane`: a no-op locally, insurance for remote or container sessions that
default to UTC.

`tests/settings-json.test.mjs` enforces that every `~/.claude` path `settings.json`
references is actually shipped by this repo.

