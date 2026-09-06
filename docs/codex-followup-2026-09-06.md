# Codex daytime setup

This record lets Jason resume the setup without confusing configured features with verified behavior.

## Agreed scope

Use daytime-safe guards for transcoder, ambient, and claude-skills. Keep Nightshift’s blanket merge and configuration-commit restrictions unchanged. Match repository remotes so worktrees inherit the daytime policy without modifying project files.

Block CI bypasses, force pushes, skipped commit checks, and the existing test-removal and blanket serial-test cases. Allow ordinary commits and reviewed merges. A non-main transcoder PR stops for Jason’s confirmation; Codex does not support Claude’s hook-level `ask`. After confirmation, Jason runs that exceptional command himself rather than the agent disabling its guard.

The guard is a textual tripwire, not a shell security boundary. Existing test-removal checks run at commit time in ambient and claude-skills; they do not prevent every edit. GitHub branch protection remains necessary.

Apply the managed files with `chezmoi apply ~/.local/bin/codex-project-guard ~/.codex/hooks.json`. Review the new hook through Codex’s `/hooks` interface. Do not fabricate hook trust or bypass it.

Then seed Chrome MCP using the already cached `npx --offline --yes chrome-devtools-mcp@1.8.0`, with `--isolated --headless --no-usage-statistics --no-performance-crux`. Apply `~/.codex/config.toml` through chezmoi and test a synthetic page. Do not attach personal Chrome tabs or install packages.

Finally recheck native memory consolidation and recall, run focused setup tests, and push the dotfiles commits to `jasonm4130/dotfiles`. Do not modify the native memory database or claim imported files prove recall.

## Verification

- The combined config, global-hook, and project-guard suite returned `tests 12`, `pass 12`, `fail 0`. Project fixtures reuse the three local checkouts' guard scripts.
- Codex’s native hook browser reported `PreToolUse 3 installed, 3 active`. Native sessions in all three projects ran `git status --short` successfully and blocked a harmless policy-matching help command. Transcoder blocked a non-main PR probe; ambient and claude-skills blocked `--admin` probes. No PRs or merges were created.
- Codex’s MCP runtime reported Chrome `connected`. `evaluate_script` returned `{"title":"Codex smoke","text":"CHROME_DOM_OK"}`. `close_page` confirmed the test tab closed. The helper ended with `CHROME_DOM_SMOKE_PASS`.
- Native memory remains pending. At this check, `memory_consolidate_global` still showed `done` at `2026-09-06 10:41:41` UTC. `MEMORY.md` was 147 bytes and still said no evidence had been consolidated. Imports and curated notes exist, but that does not establish recall. Do not alter the native database or hand-edit its generated index to force success.

The guard handles ordinary per-project tool working directories and simple `git -C` or leading `cd` routing. It does not interpret arbitrary shell scripts. Run project commands with the tool’s working directory set explicitly.
