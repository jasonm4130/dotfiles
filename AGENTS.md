# dotfiles

chezmoi source for Jason's Mac: shell, git, brew, mise, macOS defaults, launchd agents, and the Claude Code and Codex installation. `README.md` covers scope and bootstrap pitfalls; `docs/maintenance.md` covers the launchd agents and the manual one-time steps. Read the relevant one before changing that area.

## This repo is public

- Never add a secret value, a private repo name, a private hostname or domain, or anything about an employer. Private detail goes in `~/Code/.map` (private repo map), the wiki, or a file under `~/.config` that chezmoi does not manage. Some private names in `docs/` and the ships-log files predate this rule; don't add more.
- Secrets are read from 1Password at run time inside a run script or install helper (`op read`), never rendered into a file this repo tracks.

## Where and how to edit

- The live source is `~/.local/share/chezmoi`. `~/Code/dotfiles` is a second clone of the same repo; don't edit both. Make changes in a worktree under `.claude/worktrees/` (gitignored, and chezmoi skips dot-directories in the source).
- Preview with `chezmoi diff --source <worktree> <target>`. After the merge, `chezmoi apply <target>` for the targets you changed. Read `chezmoi status` before any full `chezmoi apply`: unrelated drift may be waiting, and apply overwrites it.
- When a live file was changed on purpose, bring it back into the source: `chezmoi re-add <target>` for a plain file, or edit the `.tmpl` by hand. `chezmoi-drift` walks each drifted file and offers re-add, apply or skip. Apps that rewrite their own config (`~/.codex/config.toml`, herdr) drift this way.
- Run scripts are `run_onchange_after_NN-<name>.sh[.tmpl]`; take the next free number. They must be idempotent and must skip with a message, not fail, when a prerequisite is missing (1Password, a cloned repo, a binary), so a fresh machine's apply keeps going.
- `~/.claude` is allowlisted in `.chezmoiignore`: a new path there needs its own `!` re-allow line or it is silently skipped.
- Use `private_` for anything that should be 0700/0600 on disk.
- The filesystem is case-insensitive: `agents.md` and `AGENTS.md` are the same file.

## Checks

CI (`.github/workflows/test.yml`) runs all three on every PR; run what you touched first.

- `node --test tests/*.test.mjs`
- `shellcheck --severity=warning` on shell scripts (not `.md`, not `.tmpl`)
- Templates: CI renders every template with an isolated `HOME` and shellchecks rendered `*.sh.tmpl`. Locally, `chezmoi execute-template --source <worktree> < <file>`, or `chezmoi diff` on the target.
