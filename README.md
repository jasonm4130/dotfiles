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
- **Claude Code** — settings, hooks, custom skills (`~/.claude/`)
- **AGENTS.md** — unified AI tool instructions, rendered to per-tool files
- **Brewfile** — formulae, casks, fonts, App Store apps
- **macOS defaults** — Dock, Finder, keyboard, etc.

## Manual one-time steps after bootstrap

1. Open 1Password → Settings → Developer → enable **"Integrate with 1Password CLI"** + **Touch ID**
2. Sign in to the App Store (so `mas` entries install)
3. Open a new terminal — secrets resolve via `op inject` at shell start

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
