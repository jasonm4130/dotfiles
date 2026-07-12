# Dotfiles

Personal macOS dev environment, managed with [chezmoi](https://chezmoi.io).

## Bootstrap

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply jasonm4130
```

That command installs chezmoi, clones this repo to `~/.local/share/chezmoi`, runs the install scripts (Homebrew, Brewfile, fonts, macOS defaults), and writes all dotfiles.

## What's in here

- **zsh** — `.zshrc`, `.zshenv`, `.zprofile`, with `op inject` for secrets
- **Starship** — prompt config (`~/.config/starship.toml`)
- **WezTerm** — terminal config (`~/.config/wezterm/wezterm.lua`)
- **Zed** — editor config (`~/.config/zed/`)
- **Claude Code** — settings, hooks, custom skills (`~/.claude/`); tab-title hook plays ElevenLabs voice clips on finish/needs-input (fanfare), falling back to the Glass chime when no clips are generated. Guard hooks follow the protection/advisory split: secrets-scan **fails closed** (blocks writes it cannot scan, denies via `permissionDecision` JSON); advisory guards (lsp-first) fail open
- **AGENTS.md** — unified AI tool instructions, rendered to per-tool files
- **Brewfile** — formulae, casks, fonts, App Store apps
- **macOS defaults** — Dock, Finder, keyboard, etc.
- **CI** — GitHub Actions runs `node --test tests/` (hook & script suites) on ubuntu + macOS × Node 20/22 on every push/PR

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

## Design

See [`docs/specs/2026-05-08-dotfiles-design.md`](docs/specs/2026-05-08-dotfiles-design.md).

## License

MIT — see [LICENSE](LICENSE).
