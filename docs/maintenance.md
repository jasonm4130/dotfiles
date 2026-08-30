# Maintenance

## Scheduled maintenance (launchd)

- `dev.jasonmatthew.brew-update` — Mondays 09:00: `brew update` then upgrade formulae + casks, logging to `~/Library/Logs/brew-weekly-update.log`. Casks needing sudo (e.g. displaylink) fail into the log and need an occasional manual pass.
- `dev.jasonmatthew.chezmoi-drift` — daily 09:30: macOS notification when `chezmoi status` is non-empty, so drift gets settled the day it appears (`chezmoi apply` already fails safe on drifted files; this adds timely detection). Settle with `chezmoi-drift`: per-file diff, then re-add (keep local edit) / apply (restore source) / skip.
- `dev.jasonmatthew.daily-notes-update` — Fridays 18:00: `daily-notes-weekly.sh` backfills the Obsidian daily notes for the past 7 days, gathering your authored commits across `~/Work/Git` in Brisbane-local time and handing each day's bundle to `claude -p` to synthesise into the note's Notes/Wins sections. Logs to `~/Library/Logs/daily-notes-weekly.stdout.log`; dry-run it with `DAILY_NOTES_DRY_RUN=1`, which resolves the vault and gathers commits but calls neither `claude` nor any writer. It resolves `claude` at run time rather than hardcoding a path, and refuses to start when the vault or the binary is missing — previously a day with no commits exited 0 while writing nothing, logging "created note skeleton" for notes it had not created, which is the shape a weekly job takes when it has been dead for months. The vault lives at `~/Documents/Main` and **is** a git clone of `jasonm4130/Obsidian-Main-Vault` — restore it on a new machine with `git clone` into that path, which the bootstrap does not do for you (445MB, and it carries its own `CLAUDE.md`). The path deliberately has no space in it, unlike the `~/Documents/Obsidian Vault` it replaced. `~/Documents` is TCC-protected, so the first run of anything touching it needs a one-time permission grant; check Desktop & Documents iCloud sync stays **off** (`defaults read com.apple.finder FXICloudDriveDesktop` → `0`) before putting a repo of that size there.
- `claude-stay-awake.sh` — a `SessionStart` hook holding `caffeinate -i -m -w <claude pid>` for the life of the session. Claude Code already spawns `caffeinate -i -t 300` itself, but that is a rolling five-minute window that lapses five minutes after the last activity — so a session waiting on a background agent, a CI run or a slow build counts as idle and the machine sleeps mid-task, which is also how scheduled launchd jobs come to miss their slots. Deliberately **not** `-d`: the display still sleeps, the machine does not. `-w` ties the assertion to the process, so a crashed session cannot leave the Mac permanently awake and there is no cleanup path to forget. Confirm with `pmset -g assertions` — you want `PreventUserIdleSystemSleep 1` and `PreventUserIdleDisplaySleep 0`.
- `com.jasonmatthew.disk-maintenance` — monthly, 1st at 03:00: `disk-maintenance.sh` trims regenerable build artifacts and package caches. Logs to `~/Library/Logs/disk-maintenance.log`.

That is the full set of chezmoi-managed agents — `find private_Library/private_LaunchAgents -type f` is the source of truth, and this list drifted once by documenting only two of four.

## Manual one-time steps after bootstrap

1. Open 1Password → Settings → Developer → enable **"Integrate with 1Password CLI"** + **Touch ID**
2. Sign in to the App Store (so `mas` entries install)
3. Run **`codex login`** — an interactive browser OAuth flow that writes `~/.codex/auth.json`. Machine-local, not restored by the bootstrap, and it fails the same way an unseeded MCP Keychain entry does: the CLI installs and runs fine, then 401s on first real use. Verify positively with `codex exec --skip-git-repo-check 'reply with the single word OK'` rather than checking for the file. Note the review chain log under `~/.claude` is machine-local too, so a fresh Mac starts the `codex-review` gate stats from zero
4. Open a new terminal — secrets resolve via `op-fast inject` at shell start. If 1Password is locked you get one warning on stderr and the vars stay unset; unlock it and run **`op-env-reload`** to recover that shell without opening a new one. A login shell with no tty stays silent by design. **GUI apps launched from the Dock or Finder never source `.zprofile`** and so see none of these — give such an app its own `op run` wrapper rather than exporting globally with `launchctl setenv`, which would publish the secrets to every process on the machine

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

