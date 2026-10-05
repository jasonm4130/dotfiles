# Claude Code setup

How `~/.claude/` is configured by this repo. See [Scope](../README.md#scope) for what
lives here versus in the claude-skills marketplace.


Settings, hooks, agents, rules, MCP config and sounds under `~/.claude/`. Run
`chezmoi managed | grep '^\.claude'` for the live list. Skills are **not** tracked here —
they come from installed plugins (see [Scope](#scope)) — with one exception: herdr's agent
skill. `~/.agents/skills/herdr/SKILL.md` renders `herdr --skill` (the copy bundled with the
installed binary, so it matches the release), and `~/.claude/skills/herdr` links to it; the
allowlist admits only that link, because `~/.claude/skills/synced` belongs to claude.ai.

`.chezmoiignore` denies everything under `.claude/` and re-admits named subdirectories, so
**a new subdirectory is invisible to chezmoi until it is allowlisted there** — it applies
clean and silently manages nothing.

## Fleet weather mod

`~/.claude/skills/fleet-weather` is a mod, not a skill: a plugin folder (`.claude-plugin/plugin.json`
plus a hooks module) that Claude Code auto-loads from a skills folder and hot-reloads when its
files change, so `chezmoi apply` of it takes effect in running sessions. It draws a pixel-art
ship in a 5-row band above the prompt, sailing in the weather of the Firstmate fleet read
from `$FM_HOME/state/home-summary.json` (default home `~/Work/Git/firstmate`): storm for a fresh
`blocked` decision, a blocked crew, supervision cooling down, watcher downtime or a fleet view
not republished for 10 min; rain for a failed or fixing validation, or a `blocked` decision first
seen over 2 h ago; clouds for a decision waiting on the captain; night when no crew is active;
calm otherwise. It is a no-op in Firstmate workers (`FM_TASK_ID` set; they load it too, through
`~/.claude-fm-workers/skills`) and draws nothing while no home summary resolves.

Each session sails one of four vessels, a galleon, a schooner, a sloop or a junk, chosen from a
seed taken when the mod loads and kept until it reloads; each reefs in rain, strikes to a storm
sail in a storm and furls at night with its stern windows lit. To pin one, set
`FLEET_WEATHER_SHIP=galleon|schooner|sloop|junk` in the session's environment (any other value
means pick for me). The sea is procedural from the same seed, so no two sessions share one:
swell and drifting noise, with whitecaps and spray scaling with the weather's severity and sun
or moon glints in calm and at night.

The scene is drawn at 2x4 pixels per cell (a ship is four rows tall, 16 pixels) and fitted
to glyphs chafa-style: each cell takes the glyph, and the two colours, that best reproduce
its pixels, with braille dots for thin lines (rigging, rain, spray, stars). Set
`FLEET_WEATHER_GLYPHS=quadrant|half` to choose the glyphs. The default is `quadrant`
(quadrant blocks plus `▂ ▆`, 2x4 vertical edges); `half` is the original renderer's look.
`octant` and `sextant` are accepted but fall back to `quadrant` in the band, because Claude
Code's Raster refuses any code point beyond the BMP (checked on 2.1.289: "beyond the Basic
Multilingual Plane"). `node ~/.claude/skills/fleet-weather/preview.mjs` prints every ship in
every weather as ANSI truecolor, the same frame in half, quadrant, sextant and octant side by
side (flags: `--weather`, `--variant`, `--glyphs`, `--frames`, `--step`, `--width`, `--theme`,
`--seed`), to eyeball a change without the TUI.

It replaces Firstmate Calm's working-row sailboat rather than joining it: run `/calm off` once in
a captain session (the choice persists in `$FM_HOME/config/calm`), or both ships draw. That also
turns off Calm's hiding of tool rows, operational rows and working notes; supervision notes keep
showing either way. The band collapses like any other with `ctrl+x ctrl+a`.

The forecast, scene, cell fitter and Raster packing in `lib/` are pure and covered by
`tests/fleet-weather.test.mjs`; `claude plugin test` runs the engine-level tests in the mod's own
`tests/` against a copy with `dot_claude-plugin` renamed to `.claude-plugin`.

## Rules

`~/.claude/rules/*.md` is loaded into every session regardless of working directory, which
makes it the home for global guidance too bulky for `CLAUDE.md`. `harness-behaviours.md`
lives here for that reason: Claude-only, and 13% of the global file before it moved;
`code-harness.md` holds the code-work half (sandbox, worktrees, stdin) and loads the same way.

Verified rather than assumed — a canary rule was read back by `claude -p` from an unrelated
cwd. Note that `paths:` glob scoping does **not** work at user level; a rule here is either
loaded always or not present.

## Guards

One hot-path guard — `secrets-scan` — is the sole subcommand of a compiled Go binary at
`~/.local/bin/claude-hooks`, built from `dot_local/src/exact_claude-hooks/` by
`run_onchange_after_15-claude-hooks-build.sh.tmpl` on every apply. The `exact_` prefix is
load-bearing: without it a file deleted from source lingers in the target, and since Go
compiles unused functions without complaint, deleted code would keep shipping in the
binary with nothing reporting it. A hook is spawned per matching tool call, so what costs is process start, not
the work: 21.1 ms of node boot against 2.9 ms compiled, 7.3×.

Nothing is committed pre-built, so there is no shipped artifact and no staleness hazard.
The trade is that a missing toolchain is **fatal** rather than a soft skip — a
`settings.json` pointing at a binary that was never built would leave every write unscanned
with no error anywhere.

Guards follow a protection/advisory split:

- **`secrets-scan` fails closed** — blocks writes it cannot scan, denying via
  `permissionDecision` JSON.
- **Advisory guards fail open** — `claude-md-guard`, `disk-guard`.

`lsp-first` used to live here too. It moved to the `gates` plugin in
[claude-skills](https://github.com/jasonm4130/claude-skills) — it is generic, advisory and
fails open, so it is distributable capability rather than machine state. `secrets-scan`
stays because it fails **closed**, and a plugin's hooks fail open silently on documented
loading paths.

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

The herdr SessionStart hook (`hooks/herdr-agent-state.sh`, in the Brewfile as `herdr`) reports
the session id to the local herdr socket so a Claude pane can be restored after a server
restart; it exits at once outside herdr. herdr owns the script: `herdr integration install
claude` rewrites it and the settings entry, so after a herdr update re-add both here rather
than editing the source by hand.

`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` in the settings `env` block strips Anthropic and cloud
credentials from Bash, hook and MCP-stdio subprocesses — `secrets-scan` catches secrets on
the way out, the scrub caps what a subprocess can read. That block also pins
`TZ=Australia/Brisbane`: a no-op locally, insurance for remote or container sessions that
default to UTC.

`tests/settings-json.test.mjs` enforces that every `~/.claude` path `settings.json`
references is actually shipped by this repo.

