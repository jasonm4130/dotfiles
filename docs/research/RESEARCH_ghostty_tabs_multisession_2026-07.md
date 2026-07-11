# Ghostty tab-awareness & multi-session Claude Code setups (July 2026)

Deep-research synthesis, 2026-07-11. Four-angle fan-out (tab-awareness, multi-session stack, landscape refresh, config recipes) with per-angle citation verification. Follow-up to `RESEARCH_terminal_interfaces_claude_code_2026.md` (June 2026). Tier-1 verification: tab-awareness **medium**, multi-session-stack **medium**, recipes **medium**; the landscape-refresh angle was re-run outside the verification harness after the original agent returned stub data — treat its version-specific claims (cmux v0.64.16, Herdr v0.7.0) as single-pass.

## Verdict

**Stay on Ghostty; the fix for the "which tab is Claude in" problem is a config layer, not a new terminal.** The June verdict softens but doesn't flip: Ghostty 1.3.1 remains the consensus base on macOS, but bare Ghostty's gaps for multi-agent work (no per-tab indicators, no session restore, excluded from Agent Teams split-pane) are now widely documented, and purpose-built companions (cmux, Herdr) plus iTerm2's native Claude Code integration are the H2-2026 story. The disambiguation layer recommended in June (hooks + titles + statusline) was never implemented in this dotfiles repo — that, not the emulator, is the gap.

## The tab problem, precisely

1. **Claude Code owns the tab title while running.** It writes a live Haiku-generated task summary with a state glyph via standard OSC title sequences — `·` working, `✳` idle/done, e.g. `✳ Fixing auth bug` ([env-vars docs](https://code.claude.com/docs/en/env-vars), [issue #45056](https://github.com/anthropics/claude-code/issues/45056)). Useful for *state*, useless for *which project* — six tabs show six task summaries with no directory.
2. **You can't cleanly turn that off.** `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` is documented, but [issue #47397](https://github.com/anthropics/claude-code/issues/47397) (closed "not planned") confirms it only suppresses startup/shutdown title changes, not mid-session updates. Blog recipes that rely on it (e.g. the Rands wrapper) are folklore that half-works. Peter Steipete's workaround re-asserts a custom title every 0.5 s in a background loop — functional, hacky.
3. **Ghostty has no per-tab visual indicator.** No tab colors, no per-tab attention dot, no `window-subtitle` on macOS (GTK-only). `bell-features = title` should prepend 🔔 to an alerted tab's title but is reported not to appear on macOS. This exact Claude-multi-tab use case is an open, unimplemented feature request ([discussion #10692](https://github.com/ghostty-org/ghostty/discussions/10692)); tab colors are "wait for a custom tab bar" per mitchellh ([discussion #10152](https://github.com/ghostty-org/ghostty/discussions/10152)).
4. **The supported signal channel is hooks → `terminalSequence`.** Claude Code hooks can no longer write to `/dev/tty` (v2.1.139+); instead any hook may return a `terminalSequence` JSON field (v2.1.141+) with an allowlisted escape: OSC 0/1/2 (title), OSC 9 (iTerm2-style notify), OSC 99 (Kitty), OSC 777 (Ghostty/urxvt/Warp notify), or bare BEL ([hooks docs](https://code.claude.com/docs/en/hooks)). `Notification` hook matchers include `permission_prompt`, `idle_prompt`, and (v2.1.198+) `agent_needs_input`/`agent_completed`; `Stop` always fires.
5. **Ghostty already forwards Claude Code desktop notifications natively** — Ghostty, Kitty, and iTerm2 are the only terminals where this works with zero config ([terminal-config docs](https://code.claude.com/docs/en/terminal-config)).

## Multi-session stack: what converged

- **Git worktrees are the universal primitive, now first-class in the CLI.** `claude --worktree <name>` / `-w` (v2.1.49+) creates `.claude/worktrees/<name>/` on branch `worktree-<name>` and starts Claude inside it; no third-party manager needed ([worktrees docs](https://code.claude.com/docs/en/worktrees)).
- **Two viable terminal-level patterns, no single winner:**
  - *tmux + worktrees* — still the "production" pattern Anthropic's docs push; unique value is detach/reattach and SSH survival, and it's required (with iTerm2) for Agent Teams split-pane mode. Ghostty is explicitly unsupported for Agent Teams splits, blocked on Ghostty lacking a programmatic API ([issue #24189](https://github.com/anthropics/claude-code/issues/24189), pending ghostty#2353 — the 1.4 "scriptability" roadmap item).
  - *Native Ghostty tabs/splits + worktrees + title/hook signals* — a credible documented track for non-tmux users; practical ceiling ~3 splits per screen, replicate via Cmd+T (new tabs inherit cwd by default via `window-inherit-working-directory`).
- **Managers:** ccmanager is the non-tmux manager (live busy/waiting/idle per worktree, auto-appends `--teammate-mode in-process`); claude-squad and workmux remain tmux-flavored (workmux also drives kitty/WezTerm/Zellij). Claude Code Desktop's "Mission Control" sidebar (Apr 2026) is a native session dashboard outside the terminal.
- **New in H2 2026:** **cmux** — a native macOS terminal built on libghostty specifically for parallel-agent disambiguation (sidebar per workspace: git branch, cwd, ports, latest notification; hook-driven `cmux notify`), endorsed by Mitchell Hashimoto, actively developed. **Herdr** — Rust multiplexer that runs *inside* Ghostty, classifies each agent pane blocked/working/done/idle, adds detach/reattach. iTerm2 3.7 beta ships a native Claude Code integration + Tab Status system — the strongest first-party competitor move.

## Landscape refresh (does anything change the Ghostty verdict?)

- Ghostty: latest stable 1.3.1 (2026-03-13); 1.4 due ~September 2026, roadmap language ("scriptable, true tmux control mode, graphical preferences") is non-committal. 1.3.0's AppleScript API (preview) enables third-party session restore (boo, ghosttpy); native session restore still absent.
- WezTerm: still no tagged release since 2024-02-03. The community fork pre-announced in discussion #7796 had **not shipped** as of this research; community effort shifted to PR triage (discussion #7845). Don't go back.
- Kitty: normal cadence (0.46–0.47.3), nothing agent-specific. iTerm2: 3.7 betas headline Claude Code integration. Warp: open-sourced (AGPL, Apr 2026), pivoting to cloud agent orchestration ("Oz") — different category.
- The most-cited five-terminal comparison (alexdunlop.com, 2026-06-22) lands on: "cmux if you want agent-native and you're Mac-only; Ghostty + tmux if you need session persistence and scriptable layouts."

## Recommended changes for this repo (verified recipes)

1. **zsh title hook** (in `dot_zshrc`) so an idle/non-Claude tab always shows its directory — starship has no title feature, so no conflict:
   ```zsh
   autoload -Uz add-zsh-hook
   _title_precmd()  { print -Pn "\e]0;%~\a" }
   _title_preexec() { print -Pn "\e]0;%~ — ${2%% *}\a" }
   add-zsh-hook precmd _title_precmd
   add-zsh-hook preexec _title_preexec
   ```
   Pair with `shell-integration-features = no-title` in the Ghostty config so Ghostty's own integration doesn't fight it.
2. **Claude Code hooks stamping project + state at attention moments** (in `settings.json`): a `Notification` hook (matcher `permission_prompt|idle_prompt|agent_needs_input`) and a `Stop` hook, each returning `terminalSequence` with OSC 0 `⏸/✅ <dirname>` (hook stdin JSON includes `cwd`) and optionally OSC 777 for a Ghostty notification. Accept that Claude's own task-summary title takes over while it's *working* — that's actually useful; the hooks guarantee the project name is on the tab at the moments you scan for it (waiting / done). Known caveat: hook-set titles and Claude's title management can interleave ([#34929](https://github.com/anthropics/claude-code/issues/34929), closed as dup — no first-party `terminalTitle` field yet).
3. **Ghostty bell tuning** (optional): `bell-features = attention,audio` + `bell-audio-path` for an audible done-signal; note the 🔔-in-title feature may not render on macOS (#10692).
4. **Statusline**: `handoff-statusline.mjs` receives `workspace.current_dir` and `worktree.name/branch` on stdin — surface them prominently for in-tab orientation.
5. **Parallel sessions without tmux**: `claude -w <task>` per tab; new tabs inherit cwd. If/when sessions multiply past ~4, trial **cmux** (familiar — it *is* libghostty) or Herdr rather than adopting tmux.

## Contradictions & warnings

- Docs say `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` disables title updates; a closed-as-not-planned bug says it only affects startup/shutdown. Trust the bug report; don't build on the env var.
- Ghostty docs say `bell-features = title` prepends 🔔; a Feb 2026 discussion reports it doesn't appear on macOS. Unresolved.
- alexdunlop.com backs 4 landscape claims (Warp/Oz, cmux restore limits, Ghostty session persistence, final verdict) — treat as one perspective.
- Landscape-refresh angle: single-pass (re-run after the original workflow agent returned stub data); version numbers for cmux/Herdr unverified by a second source.

## Sources

**tab-awareness** *(medium reliability)*: ghostty.org/docs/features/shell-integration · ghostty.org/docs/vt/osc/9 · ghostty.org/docs/config/reference · ghostty.org/docs/install/release-notes/1-3-0 · github.com/ghostty-org/ghostty/discussions/10152 · github.com/ghostty-org/ghostty/discussions/10692 · code.claude.com/docs/en/terminal-config · code.claude.com/docs/en/env-vars · code.claude.com/docs/en/hooks · randsinrepose.com/archives/better-faster-and-even-more · github.com/anthropics/claude-code/issues/25307 · github.com/anthropics/claude-code/issues/45056 · github.com/anthropics/claude-code/issues/34929 · gist.github.com/michael-swann-rp/6112d64456b49ec606d7fdbe1e2bd310 · github.com/matjic/cc-terminal-notifier · srstevenson.com/posts/zsh-terminal-title

**multi-session-stack** *(medium reliability)*: code.claude.com/docs/en/agent-teams · github.com/anthropics/claude-code/issues/24189 · code.claude.com/docs/en/hooks · handbook.reopt.ai/en/books/claude-code-advanced/multi-session · frr.dev/posts/claude-code-ghostty-worktrees-mac-setup · alexdunlop.com/writing/best-terminal-for-claude-code · codewithseb.com/blog/parallel-claude-code-sessions-git-worktrees-guide · zenn.dev/maedana/articles/claude-code-multi-session-tools-comparison · github.com/kbwo/ccmanager · news.ycombinator.com/item?id=47079718 · miraflow.ai/blog/claude-code-desktop-redesign-parallel-sessions-routines-workspace-guide · steipete.me/posts/2025/commanding-your-claude-code-army · github.com/samleeney/tmux-agent-status

**landscape-refresh** *(single-pass, unverified)*: ghostty.org/docs/install/release-notes/1-3-0 · github.com/ghostty-org/ghostty/issues/11208 · github.com/wezterm/wezterm/discussions/7796 · github.com/wezterm/wezterm/discussions/7845 · linuxiac.com/kitty-0-47-terminal-emulator-adds-drag-and-drop-kitten · github.com/gnachman/iTerm2/blob/master/docs/notes-3.7.0beta2.txt · iterm2.com/downloads.html · github.com/manaflow-ai/cmux · herdr.dev · alexdunlop.com/writing/best-terminal-for-claude-code

**recipes** *(medium reliability)*: ghostty.org/docs/config/reference · github.com/ghostty-org/ghostty (shell-integration README) · code.claude.com/docs/en/hooks · code.claude.com/docs/en/hooks-guide · code.claude.com/docs/en/terminal-config · code.claude.com/docs/en/statusline · code.claude.com/docs/en/worktrees · github.com/anthropics/claude-code/issues/47397 · github.com/anthropics/claude-code/issues/16572 · srstevenson.com/posts/zsh-terminal-title · steipete.me/posts/2025/commanding-your-claude-code-army
