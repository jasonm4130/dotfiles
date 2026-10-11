# Native Codex baseline

Run `codex` in the project directory. Give each thread one outcome and describe
how to verify it. Use native planning, subagents, review, and memory as needed.
No custom work-loop or Claude compatibility layer is required on ordinary launches.

## Install and update

Chezmoi installs Codex through OpenAI's standalone installer with
`run_onchange_after_03-codex-install.sh`. An existing standalone install is left
in place. `~/.local/bin/codex` points into `~/.codex/packages/standalone/current`.
Codex is excluded from the Homebrew package list. Use `codex update` for manual
updates; the native daemon also reported automatic updates enabled at setup.

The shared daemon held both plain `codex` and explicit `--remote unix://` test
sessions on September 11. No terminal wrapper is required. Chezmoi also loads
`dev.jasonmatthew.codex-shared-server`, which sets the desktop's built-in
`CODEX_APP_SERVER_USE_LOCAL_DAEMON=0` launch option at login, so the desktop app
runs its own server rather than attaching to the shared daemon. Restart the desktop
after changing this option. This option was verified in the installed app's
code; it may need rechecking after app updates.

Desktop attachment and phone access remain pending verification after restart.
The separate desktop server currently owns the remote connection; the shared
daemon reported HTTP 409, `Remote app server already online`. Removing Homebrew
does not itself resolve that connection conflict. On a new Mac, sign in and run
`codex remote-control start` to enable remote access before testing from the phone.

## What belongs to Codex

Personal instructions live in `~/.codex/AGENTS.md`, managed directly by chezmoi's
`dot_codex/AGENTS.md`. Project instructions use `AGENTS.md`; Codex no longer falls
back to `CLAUDE.md`. The short home-directory file adds no duplicate global rules.
The shared Claude renderer only writes Claude's file.

Native approval review, sandboxing, memory, and bundled app integrations remain.
Herdr's native SessionStart hook is the only global hook that acts in an interactive
session. Claude-related shell variables and the imported worker override are
disconnected. The Claude source files and scripts are preserved.

## Unattended sessions

Firstmate crewmates, no-mistakes agents and Codex secondmates run Codex with
`approval_policy=never`, so nobody can answer an approval. Two layers give them the
Firstmate worker profile's boundaries:

- `rules/unattended.rules` marks ssh, scp, sftp, mosh, ansible, `incus remote`,
  `gh pr merge` and `chezmoi apply`/`update` as `prompt`. Under `never` Codex refuses
  them (`approval required by policy, but AskForApproval is set to Never`); an
  interactive session sends them to its approval reviewer instead. Rules still apply
  when Firstmate launches a crewmate with `--disable hooks`.
- `hooks/unattended-guard.sh`, the one PreToolUse hook, runs `homelab-guard.sh`,
  `claude-hooks secrets-scan`, `disk-guard.sh pretool` and the docs-sync narrowing
  hook on Bash and `apply_patch` payloads. It acts only when Codex reports
  `permission_mode` `bypassPermissions`, which `approval_policy=never` produces, and
  guards a payload missing that field. Codex skips an untrusted hook silently in
  `codex exec`, so a new or changed entry needs `/hooks` review once per machine.

Crewmates launched with `--disable hooks` therefore get the rules only: a curl or rsync
to a homelab host, secrets-scan, disk-guard and docs-sync do not reach them.
`tests/codex-hooks.test.mjs` covers the hook and the rules.

Custom MCP connections are disabled in Codex, with their settings retained for
deliberate re-enablement. The legacy work-loop and shared writing skill are disabled
in Codex's skill configuration. Legacy worker/reviewer profiles remain available
only through explicit selection; `work` is a native-baseline alias. None of these
changes disables a plugin or hook in Claude Code.

The imported Claude hooks in `~/Documents/Main/.codex/hooks.json` remain disabled
in Codex's hook state. Existing native repository hooks are outside this global
cleanup. Herdr's native hook was subsequently enabled through Codex's settings API;
the runtime reports `enabled: true` and `trustStatus: trusted`.

The pre-change live files and imported worker are preserved under
`~/.local/state/codex-native-backup-20260911/`. Restore individual settings only
after reviewing their source ownership; a blanket restore would re-enable the
hybrid setup. The original improvement-loop drafts remain uninstalled.

## Two checks that need the desktop

Automatic import syncing was confirmed off in the desktop UI ("Sync paused").
Keep it off in ChatGPT **Settings > Import**. Otherwise a future
import may reintroduce the configuration removed here. The app owns this setting;
Codex's imported-category values of `original` do not establish whether syncing
is enabled. Agent access to this setting is hidden, so confirm it in the UI.

The September 11 restart was verified: client and server both report 0.9.0,
`private_protocol_compatible: yes`, and `restart_needed: no`. The Codex integration
reports `current (v8)`, with its hook enabled and trusted. Herdr recognized the
current Codex pane, its session ID, and its live `working` state. A working-to-done
transition was not observed during this check. Run `herdr status` and
`herdr integration status` before diagnosing future lifecycle problems.

Stop the main Herdr server only after saving pane work and explicitly approving
the interruption: `herdr server stop` exits its pane processes. Launch `herdr`
again in the terminal, recheck compatibility, and observe a Codex turn transition
from working to done. Configuration validation cannot establish that transition.

## Build improvements from evidence

After repeated friction, ask for a retrospective with a concrete proposal and
acceptance check. Approve the smallest useful change, then check the next comparable
task for recurrence. Keep changes that help; revise or remove those that do not.
No scheduler, automatic rule rewriting, or new retrospective framework was installed.

The fresh-session acceptance check loaded `Personal Codex defaults` and
`Dotfiles source guidance` and returned `claude_memory_paths_prescribed: false`.
Personal instruction files decreased from 21,994 to 2,450 bytes. This measures
those files, not the total prompt. Seven Claude configuration/source files matched
their pre-change SHA-256 hashes. Codex's runtime confirmed the named work-loop
disable; parsing the earlier directory-based override alone had not established it.

OpenAI recommends [concise, practical guidance and learning from repeated mistakes](https://learn.chatgpt.com/guides/best-practices).
Its [instruction documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
explains global and project loading. [Skills load progressively](https://learn.chatgpt.com/docs/build-skills),
so disk size and installed-skill counts are not measurements of actual prompt usage.
The [import guide](https://learn.chatgpt.com/docs/import) explains how automatic
updates can bring external configuration back into Codex.
