# Dotfiles

Personal macOS dev environment, managed with [chezmoi](https://chezmoi.io).

## Bootstrap

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply jasonm4130
```

That command installs chezmoi, clones this repo to `~/.local/share/chezmoi`, runs the install scripts (Homebrew, Brewfile, macOS defaults), and writes all dotfiles.

## What's in here

- **zsh** — `.zshrc`, `.zshenv`, `.zprofile`, with `op inject` for secrets
- **Starship** — prompt config (`~/.config/starship.toml`)
- **Ghostty** — terminal config (`~/.config/ghostty/config`)
- **Zed** — editor config (`~/.config/zed/`)
- **Fonts** — Monaspace everywhere: both Ghostty and Zed wear the **Xenon** cut (slab-serif, terminal-esque). The generated **Monaspace Neon Radon** family (Neon for code, handwritten Radon for comments via the italic slot — Monokai Pro CE italicizes `comment`) is available but no longer wired up; rebuild it with `monaspace-radon-mix.py` after the Monaspice cask updates if you want it back.
- **Claude Code** — settings, hooks, agents, MCP config and sounds (`~/.claude/`; run `chezmoi managed | grep '^\.claude'` for the live list — skills are no longer chezmoi-tracked, they come from installed plugins); tab-title hook plays ElevenLabs voice clips on finish/needs-input (fanfare), falling back to the Glass chime when no clips are generated. Guard hooks follow the protection/advisory split: secrets-scan **fails closed** (blocks writes it cannot scan, denies via `permissionDecision` JSON); advisory guards (lsp-first) fail open. Complementing that, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` in the settings `env` block strips Anthropic/cloud credentials from Bash, hook and MCP-stdio subprocesses — secrets-scan catches secrets on the way out, the scrub caps what a subprocess can read. That block also pins `TZ=Australia/Brisbane` (a no-op locally; insurance for remote/container sessions that default to UTC). Global (user-scope) MCP servers are reconciled into `~/.claude.json` by `run_onchange_after_13-claude-mcp-servers.sh` (add-if-missing, so it never disturbs a working server) — edit that script to add/remove one, then `chezmoi apply`
- **AGENTS.md** — unified AI tool instructions, rendered to per-tool files
- **Brewfile** — rendered from `.chezmoidata/packages.yaml` (the source of truth for taps/formulae/casks); the bundle script runs `brew trust --tap` for each declared tap first, since Homebrew 6 refuses to load untrusted third-party taps
- **macOS defaults** — Dock, Finder, keyboard, etc.
- **CI** — GitHub Actions runs `node --test tests/*.test.mjs` (hook & script suites) on ubuntu + macOS × Node 20/22 on every push/PR

## Scheduled maintenance (launchd)

- `dev.jasonmatthew.brew-update` — Mondays 09:00: `brew update` then upgrade formulae + casks, logging to `~/Library/Logs/brew-weekly-update.log`. Casks needing sudo (e.g. displaylink) fail into the log and need an occasional manual pass.
- `dev.jasonmatthew.chezmoi-drift` — daily 09:30: macOS notification when `chezmoi status` is non-empty, so drift gets settled the day it appears (`chezmoi apply` already fails safe on drifted files; this adds timely detection). Settle with `chezmoi-drift`: per-file diff, then re-add (keep local edit) / apply (restore source) / skip.
- `dev.jasonmatthew.daily-notes-update` — Fridays 18:00: `daily-notes-weekly.sh` backfills the Obsidian daily notes for the past 7 days, gathering your authored commits across `~/Work/Git` in Brisbane-local time and handing each day's bundle to `claude -p` to synthesise into the note's Notes/Wins sections. Logs to `~/Library/Logs/daily-notes-weekly.stdout.log`.
- `com.jasonmatthew.disk-maintenance` — monthly, 1st at 03:00: `disk-maintenance.sh` trims regenerable build artifacts and package caches. Logs to `~/Library/Logs/disk-maintenance.log`.

That is the full set of chezmoi-managed agents — `find private_Library/private_LaunchAgents -type f` is the source of truth, and this list drifted once by documenting only two of four.

## Manual one-time steps after bootstrap

1. Open 1Password → Settings → Developer → enable **"Integrate with 1Password CLI"** + **Touch ID**
2. Sign in to the App Store (so `mas` entries install)
3. Open a new terminal — secrets resolve via `op inject` at shell start

## Fanfare voice notifications

`~/.claude/hooks/tab-title.mjs` plays a random ElevenLabs clip from
`~/.claude/sounds/fanfare/{stop,input}/` when Claude Code finishes a turn or
needs input; with no clips it falls back to the old Glass chime (input) or
silence (stop). Clips are generated once and committed, so machines get them
via `chezmoi apply` — no API key at runtime.

- Regenerate after editing `~/.claude/sounds/fanfare/phrases.json`:
  `fanfare-generate.mjs` (key comes from `op://Private/elevenlabs-fanfare/credential`;
  only changed lines are re-rendered). Then `chezmoi add ~/.claude/sounds/fanfare`.
- Pick a different voice: `fanfare-generate.mjs --list-voices`, set `voice_id`
  in `phrases.json`, re-run.
- Env knobs (mostly for tests): `CLAUDE_FANFARE_DIR`, `CLAUDE_FANFARE_PLAYER`,
  `CLAUDE_FANFARE_LOCK`, and `CLAUDE_TAB_TITLE_SILENT=1` to mute everything.
  Parallel sessions are debounced (2 s) so tabs don't yell in chorus.

## chezmoi cheat-sheet

| Task | Command |
|---|---|
| See what would change | `chezmoi diff` |
| Apply changes | `chezmoi apply` |
| Add a file from `$HOME` | `chezmoi add ~/.somefile` |
| Edit a tracked file (opens in `$EDITOR`) | `chezmoi edit ~/.somefile` |
| Re-add after editing in `$HOME` | `chezmoi re-add ~/.somefile` |
| Open the source dir | `chezmoi cd` |
| Check what's ignored | `chezmoi ignored \| grep <pattern>` |
| Render a template | `chezmoi execute-template --file <path>` |
| Pull + apply remote changes | `chezmoi update` |
| Settle source↔destination drift interactively | `chezmoi-drift` |

## Design

See [`docs/specs/2026-05-08-dotfiles-design.md`](docs/specs/2026-05-08-dotfiles-design.md).

## License

MIT — see [LICENSE](LICENSE).
