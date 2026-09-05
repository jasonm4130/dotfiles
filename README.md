# Dotfiles

Personal macOS dev environment, managed with [chezmoi](https://chezmoi.io).

## Scope

This repo ships the **installation**: `settings.json`, which plugins are enabled, MCP
registration, `CLAUDE.md`, the machine lifecycle hooks — plus everything non-Claude (shell,
git, brew, mise, macOS defaults).

Reusable Claude Code capability lives in
**[jasonm4130/claude-skills](https://github.com/jasonm4130/claude-skills)**, a plugin
marketplace.

The test: *could a stranger install this and have it work?* If yes it belongs in a plugin.
If it references this machine's paths, this prose's calibration, or this machine's state,
it belongs here.

One rule that follows from it and is easy to get wrong: **an override of a built-in
belongs here, not in a plugin.** `~/.claude/agents/Explore.md` shadows the built-in
`Explore` to pin `model: sonnet` and deny the write tools; a plugin agent can only register as `plugin:name` and
ranks below user-level, so the same file shipped as a plugin would stop shadowing anything.

## Bootstrap

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$HOME/.local/bin" init --apply jasonm4130
```

Installs chezmoi, clones to `~/.local/share/chezmoi`, runs the install scripts (Homebrew,
Brewfile, macOS defaults), and writes all dotfiles.

### Four ways it goes wrong

**Re-running the one-liner does not update an existing checkout.** `chezmoi init` only
clones when it finds no git repo in the source directory, so on a machine that already has
`~/.local/share/chezmoi` it silently leaves the old revision in place — including the
broken script you are trying to replace. Use `chezmoi update`.

**`chezmoi: command not found` after a partial bootstrap.** `get.chezmoi.io` defaults to a
*relative* install dir and `exec`s the binary directly, so it never reaches `PATH`. The
command above pins it with `-b`; a machine bootstrapped before that has it somewhere like
`~/bin/chezmoi`. Don't reach for Homebrew to recover — `01-homebrew.sh` is the step most
likely to have failed. Find it and use an absolute path:

```bash
find ~ -maxdepth 3 -name chezmoi -type f 2>/dev/null
~/bin/chezmoi update -v
```

**One dead package stops the entire chain.** `brew bundle` attempts every entry then exits
non-zero if any failed, and `02-brew-bundle.sh` runs under `set -euo pipefail` — so a
single bad formula takes down scripts 04 through 13 with it. The symptom is a machine with
most of its packages but no Oh My Zsh, no macOS defaults and no launchd agents.
`chezmoi state dump | grep runAt` shows how far the chain got; fix `packages.yaml` and
re-apply rather than re-bootstrapping. When a package moves tap, check whether it also
changed between `formulae:` and `casks:` — `ls $(brew --repo <tap>)` answers it.

**Never re-run any of this under `sudo`.** macOS sudoers keeps `HOME`, so root-owned files
land in the real home directory — chezmoi's own config among them, after which every
non-root run fails with `invalid config: … permission denied`, an error naming neither
sudo nor ownership. The first script now refuses to start as root; an already-poisoned
machine needs `sudo chown -R "$(id -u):$(id -g)"` over `~/.config/chezmoi`,
`~/.local/share/chezmoi`, `~/.cache/chezmoi`, plus anything `find ~ -maxdepth 3 -user root`
turns up.

## What's in here

| | |
|---|---|
| **[Claude Code](docs/claude-code.md)** | settings, hooks, agents, rules, MCP config, guards, sounds |
| **[Components](docs/components.md)** | zsh, mise, Starship, language servers, Ghostty, Zed, fonts, Codex, Brewfile, CI |
| **[Maintenance](docs/maintenance.md)** | launchd jobs, one-time manual steps, fanfare voice clips |

Run `chezmoi managed` for the authoritative file list.

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
| Check the language servers are actually up | `lsp-doctor` (add `--repair` to fix) |
| Rebuild the compiled hook guard | `go build -C ~/.local/src/claude-hooks -o ~/.local/bin/claude-hooks .` (or just `chezmoi apply`) |

## Design

See [`docs/specs/2026-05-08-dotfiles-design.md`](docs/specs/2026-05-08-dotfiles-design.md).

## License

MIT — see [LICENSE](LICENSE).
