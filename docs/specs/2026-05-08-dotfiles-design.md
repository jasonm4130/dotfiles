# Dotfiles & Dev Environment — Design Spec

**Date**: 2026-05-08
**Author**: Jason Matthew
**Status**: Draft, pending implementation plan

---

## 1. Overview

A reproducible, public dotfiles repository that takes a fresh macOS (Apple Silicon) machine to a fully provisioned dev environment with one command. Manages: shell, prompt, terminal, editor, AI tooling configs, Homebrew packages, fonts, and macOS system defaults.

The current machine has working configs for Zsh + Oh My Zsh + Powerlevel10k, Zed (Monaspace Neon, Monokai Pro CE, Copilot), Claude Code (with custom skills, hooks, plugins), Git, and Homebrew (~300 packages), but none of it is tracked or portable.

## 2. Goals

- One-command bootstrap on a fresh Mac
- Idempotent (safe to re-run any time)
- Selectively track Claude Code config (`~/.claude/`) without sweeping in runtime state
- Single source of truth for AI-tool instructions (AGENTS.md), rendered into per-tool files
- Secrets never committed; injected at runtime from 1Password
- Public repo without leaking anything sensitive
- Migration path from current Keychain-based secrets without service interruption

## 3. Non-goals

- Cross-platform support (macOS only; Linux is a future possibility, not in scope)
- Whole-system declarative management (Nix/home-manager — too heavyweight)
- Replacing 1Password as secrets backend
- Migrating from Volta/pyenv to mise (deferred; current works fine)
- Migrating from Oh My Zsh to a leaner framework (deferred; Starship swap is enough)

## 4. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Dotfile manager | **chezmoi** | Active maintenance (v2.70.3, 2026-05-07), templating, native 1Password integration, run_onchange scripts, scales to 2nd machine cleanly. |
| Repo visibility | **Public** on GitHub | Forces good secrets discipline; serves as portfolio. |
| Repo layout | **Flat chezmoi-canonical** | Topical via filename prefixes (`run_once_before_NN-`), idiomatic. |
| Secrets — files in repo | **age via chezmoi `--encrypt`** (rare; reserve for SSH keys etc., not in v1) | Single key, no GPG overhead. |
| Secrets — runtime env vars | **Inline `op inject` in `.zshrc`** | 1Password official guidance; one call resolves all secrets; no plaintext on disk. |
| Prompt | **Starship** (replaces Powerlevel10k) | Cross-shell, single TOML, current 2025–26 community trend; archive p10k.zsh as fallback. |
| Shell framework | **Keep Oh My Zsh** | Plugin set works; not worth churning. |
| AI configs | **AGENTS.md unified pattern** | Open standard, Linux Foundation Dec 2025; render `~/.ai/AGENTS.md` → `~/.claude/CLAUDE.md` etc. |
| `~/.claude/` strategy | **Allowlist via `.chezmoiignore`** | Track config (settings, hooks, skills, mcp-servers); ignore runtime (sessions, history.jsonl, paste-cache, .claude.json with OAuth tokens, etc.). |
| Brewfile workflow | **`.chezmoidata/packages.yaml` → `Brewfile.tmpl`** | YAML source; cleanup is opt-in via `brew-prune` alias because of [Homebrew/brew#21350](https://github.com/homebrew/brew/issues/21350). |
| macOS defaults | **Hand-curated `defaults write` script** | Mathias Bynens's `.macos` is stale; use [macos-defaults.com](https://macos-defaults.com/) + PlistWatch to discover. |
| AI in Zed | **Off** (predictions and agent panel) | User uses Claude Code in terminal; reduces editor noise. |
| Vim mode in Zed | **Off** | VSCode keymap base preferred. |
| Bootstrap entry | **`sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply jasonm4130`** | Canonical chezmoi pattern. |

## 5. Architecture

### 5.1 chezmoi mental model

Three states, each with a clean job:

1. **Source state** — files in `~/.local/share/chezmoi/` (the cloned repo)
2. **Target state** — what chezmoi computes the live filesystem should look like, after templating, secrets injection, and `.chezmoiignore` filtering
3. **Destination state** — actual files in `$HOME` after `chezmoi apply`

`chezmoi diff` shows (target) vs (destination). `chezmoi apply` reconciles.

### 5.2 Repo layout

```
dotfiles/                                       # github.com/jasonm4130/dotfiles (public)
├── README.md                                   # bootstrap one-liner + design link
├── bootstrap.sh                                # local entry point (rarely used; curl|sh dominates)
├── LICENSE
├── docs/
│   └── specs/2026-05-08-dotfiles-design.md     # this file
│
├── .chezmoiignore                              # global ignores + .claude/ allowlist
├── .chezmoidata/
│   └── packages.yaml                           # brew formulae/casks/mas/vscode lists
├── .chezmoitemplates/                          # shared template snippets (if needed)
│
├── dot_zshenv                                  # PATH bootstrap, no op calls
├── dot_zprofile                                # login shell — brew shellenv, pyenv, op inject
├── dot_zshrc.tmpl                              # interactive shell — Starship, op inject, aliases
├── archive/dot_p10k.zsh                        # fallback if Starship hated; NOT sourced
├── dot_gitconfig.tmpl                          # name from data, email from op
├── dot_gitignore_global
│
├── private_dot_config/
│   ├── starship.toml                           # NEW — replaces p10k
│   ├── op/env.tmpl                             # 1Password URI template — gets sourced via op inject
│   ├── zed/
│   │   ├── settings.json                       # improved per Section 7.4
│   │   ├── keymap.json                         # current + minor additions
│   │   ├── prompts/
│   │   └── themes/
│   ├── wezterm/wezterm.lua                     # NEW — written from scratch
│   └── git/ignore                              # XDG path
│
├── private_dot_claude/                         # see .chezmoiignore for allowlist
│   ├── CLAUDE.md.tmpl                          # generated from AGENTS.md
│   ├── settings.json                           # tracked verbatim
│   ├── settings.local.json.tmpl                # per-machine overrides
│   ├── .mcp.json
│   ├── hooks/{session-start.sh,pre-compact.sh,lsp-first-guard.js}
│   ├── skills/graphify/                        # custom skill
│   └── mcp-servers/
│
├── dot_ai/                                     # AGENTS.md unified source
│   ├── AGENTS.md                               # canonical, tool-agnostic instructions
│   ├── claude-extras.md                        # claude-only additions (graphify trigger)
│   ├── codex-extras.md                         # codex-only (placeholder)
│   └── render.sh                               # combines into per-tool files
│
├── Brewfile.tmpl                               # rendered from .chezmoidata/packages.yaml
│
├── run_once_before_00-xcode-clt.sh             # ensure Xcode CLT (idempotent)
├── run_once_before_01-homebrew.sh              # install Homebrew if absent
├── run_onchange_before_02-brew-bundle.sh.tmpl  # re-runs only when Brewfile changes
├── run_onchange_after_03-fonts.sh.tmpl         # font cache reload
├── run_once_after_04-macos-defaults.sh         # System Settings reproducibility
├── run_once_after_05-shell-setup.sh            # default shell, oh-my-zsh install
├── run_once_after_06-claude-plugins.sh         # gh extensions, claude marketplaces
└── run_onchange_after_07-agents-md-sync.sh.tmpl # render AGENTS.md → CLAUDE.md, etc.
```

## 6. Bootstrap flow

### 6.1 One-liner

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply jasonm4130
```

### 6.2 Sequence on a fresh machine

1. **chezmoi installs itself** to `~/.local/bin/chezmoi`
2. **`chezmoi init`** clones `github.com/jasonm4130/dotfiles` to `~/.local/share/chezmoi`
3. **Prompts** (`promptStringOnce`): hostname tag (`personal`/`work`), git email override (default from data), GitHub username
4. **`chezmoi apply` runs scripts in this order**:
   1. `run_once_before_00-xcode-clt` — `xcode-select --install` if missing, blocks until done
   2. `run_once_before_01-homebrew` — official Homebrew installer if `brew` not present
   3. `run_onchange_before_02-brew-bundle` — `brew bundle --file=$HOME/Brewfile --no-lock`. Hash-keyed; re-runs only when Brewfile changes
   4. **chezmoi writes all dotfiles** (`.zshrc`, `~/.config/...`, `~/.claude/...`)
   5. `run_onchange_after_03-fonts` — `atsutil databases -remove` to refresh font cache
   6. `run_once_after_04-macos-defaults` — Dock, Finder, keyboard, screenshots, etc.
   7. `run_once_after_05-shell-setup` — `chsh -s /opt/homebrew/bin/zsh`, install Oh My Zsh framework if missing
   8. `run_once_after_06-claude-plugins` — `gh extension install` for known extensions; pre-register Claude marketplaces
   9. `run_onchange_after_07-agents-md-sync` — render `~/.ai/AGENTS.md` → `~/.claude/CLAUDE.md`, etc.
5. **Manual one-time steps** surfaced by README/script output:
   - Sign in to 1Password app → enable Touch ID + CLI integration
   - Sign in to App Store (so `mas` entries in Brewfile work)
   - Open a new shell — `op inject` runs at shell startup, not at chezmoi apply time, so secrets become available once the 1Password CLI integration is enabled

### 6.3 Idempotency

Three chezmoi script prefixes encode this:

- `run_` — every apply (avoid)
- `run_onchange_` — keyed on hash of rendered file; re-runs when content changes
- `run_once_` — keyed on hash, tracked in chezmoi state DB; re-runs when hash changes from last seen

`before` runs before chezmoi writes files; `after` runs after. `NN-` digits keep ordering deterministic across the prefix-sort.

## 7. Component details

### 7.1 Secrets (1Password CLI)

**Source of truth**: `private_dot_config/op/env.tmpl` (chmod 600, contains only `op://` URIs — safe to commit publicly):

```
export TAVILY_API_KEY="op://Private/tavily-api/credential"
export CLOUDFLARE_API_TOKEN="op://Private/cloudflare-api/credential"
export STRIPE_SECRET_KEY="op://Private/stripe-secret/credential"
export TURBO_TOKEN="op://Private/turbo/token"
export TURBO_TEAM="op://Private/turbo/team"
export TURBO_REMOTE_CACHE_SIGNATURE_KEY="op://Private/turbo/signature_key"
export MOONSHOT_API_KEY="op://Private/moonshot-ai/credential"
export ANTHROPIC_API_KEY="op://Private/anthropic-personal/credential"
```

**Injection** in both `dot_zshrc.tmpl` (interactive) and `dot_zprofile` (login — needed for Zed/GUI-launched MCP servers):

```bash
if command -v op >/dev/null 2>&1 && [ -r "$HOME/.config/op/env.tmpl" ]; then
  eval "$(op inject -i "$HOME/.config/op/env.tmpl" 2>/dev/null)" || \
    echo "⚠ 1Password not loaded — unlock the app or run \`op signin\`"
fi
```

**Trade-off**: ~200–400ms shell startup latency with biometric unlock. Touch ID prompt only when 1Password app is locked.

**Bootstrap chicken-and-egg**: First apply installs `1password` cask + `1password-cli` via Brewfile. User must manually open 1Password → Settings → Developer → enable "Integrate with 1Password CLI" + Touch ID. Subsequent shells see secrets.

**Migration from Keychain**: One-time script `scripts/migrate-keychain-to-1password.sh` (NOT a chezmoi `run_once_`; manually invoked on seed machine):

1. For each `zsh-secrets` Keychain entry: `security find-generic-password -s zsh-secrets -a NAME -w` → reveal value, paste into 1Password GUI under specified vault/item structure
2. Run `op inject -i ~/.config/op/env.tmpl` to verify all URIs resolve
3. Open new shell, confirm `echo $TAVILY_API_KEY` shows value
4. `security delete-generic-password -s zsh-secrets -a NAME` for each migrated key

### 7.2 Brewfile workflow

**Source**: `.chezmoidata/packages.yaml`. `Brewfile.tmpl` renders from it.

```yaml
brew:
  taps:
    - homebrew/bundle
  formulae:
    - chezmoi
    - age
    - starship
    - jq
    - gh
    - bat
    - eza
    - ripgrep
    - fd
    - fzf
    - git-delta
    - lazygit
    - neovim
    - wget
    - mas
    - 1password-cli
  casks:
    - 1password
    - wezterm
    - zed
    - claude-code
    - font-monaspace-nerd-font
    - font-jetbrains-mono-nerd-font
    - font-iosevka-nerd-font
  mas:
    # populated via `mas list` during seed
```

**Seeding from current machine** (one-time):

```bash
brew bundle dump --file=- > /tmp/Brewfile.dump
# Manual: filter into yaml format, add to .chezmoidata/packages.yaml
mas list  # for App Store apps
```

**Cleanup is opt-in** because of [Homebrew/brew#21350](https://github.com/homebrew/brew/issues/21350) (cleanup triggers `autoremove`, can uninstall packages that ARE in Brewfile).

```bash
alias brew-prune='HOMEBREW_NO_AUTOREMOVE=1 brew bundle cleanup --file=$HOME/Brewfile --dry-run'
```

User reviews dry-run output, then runs `--force` manually if happy.

### 7.3 macOS defaults

`run_once_after_04-macos-defaults.sh` — handcrafted, focused. Categories:

- **Dock**: autohide, no recents, smaller icons
- **Finder**: show extensions, list view default, no .DS_Store on network/USB, show full path in title
- **Keyboard**: fast key repeat, short delay, disable press-and-hold for accents
- **Screenshots**: save to `~/Pictures/Screenshots/`, no shadow
- **Trackpad**: tap to click, three-finger drag
- **Global**: disable smart quotes/dashes
- **Activity Monitor**: dock icon shows CPU usage
- **Safari**: dev menu, full URL in address bar

Each section ends with `killall Dock Finder SystemUIServer cfprefsd 2>/dev/null || true`.

**Discovery workflow** (for adding new defaults): `brew install plistwatch`, run it, click through System Settings, paste printed `defaults write` lines.

### 7.4 Zed config

Improved `private_dot_config/zed/settings.json`:

- Existing kept: VSCode keymap, Monaspace Neon font + ligatures, Monokai Pro CE theme, format-on-save (JS/TS off), prettier formatter, inline git blame
- Added:
  - **AI off**: `features.edit_prediction_provider: "none"`, `show_edit_predictions: false`
  - **Telemetry off**: `telemetry: { diagnostics: false, metrics: false }`
  - **Auto-save**: `on_focus_change`
  - **Inlay hints**: enabled with type, parameter, and other hints
  - **Indent guides**: enabled, indent_aware coloring
  - **Scrollbar**: git_diff, diagnostics, search_results all on
  - **Minimap**: `auto` (visible on scrollbar hover)
  - **Wrap guides**: 80, 120 columns
  - **Inline diagnostics**: enabled, max_severity warning
  - **Inline blame**: with commit summary
  - **Languages added**: Python (4-indent, ruff formatter, pyright + ruff LSPs, organize imports on save), Rust (rust-analyzer, rustfmt), Markdown (soft wrap, no completions on input, preserve trailing whitespace), YAML, TOML, JSON
  - **LSP options**: pyright (standard typeCheckingMode, openFilesOnly), rust-analyzer (clippy on check)

Companion `keymap.json` adds: `cmd-k cmd-d` toggle inline diagnostics, `cmd-k m` toggle minimap, `cmd-k p` open project settings.

**Per-project pattern**: documented in README; commit `.zed/settings.json` at repo root for project-specific overrides (e.g. Flutter SDK path for Dart projects).

### 7.5 WezTerm config (new)

Apple Silicon, Monaspace Neon, Catppuccin Mocha theme, tmux-style splits with cmd-d/cmd-shift-d, cmd-alt-hjkl pane navigation, RESIZE-only window decorations, 0.97 opacity + 20px blur, 50K scrollback, audible bell off.

### 7.6 Starship config (new)

Single-line prompt with: directory (3-segment truncation), git branch + status, language detectors (node, python, rust), command duration > 2s. Replaces 96KB Powerlevel10k. p10k archived as `archive/dot_p10k.zsh.bak` for rollback.

### 7.7 AGENTS.md unified config

`~/.ai/AGENTS.md` is canonical. `~/.ai/render.sh` concatenates AGENTS.md + tool-specific extras and writes:

- `~/.claude/CLAUDE.md` ← AGENTS.md + claude-extras.md
- `~/.codex/AGENTS.md` ← AGENTS.md
- `~/.gemini/GEMINI.md` ← AGENTS.md (when needed)

`run_onchange_after_07-agents-md-sync.sh.tmpl` re-runs `render.sh` whenever AGENTS.md or any extras file changes.

Existing `~/.claude/CLAUDE.md` content splits as:
- **AGENTS.md**: LSP-first navigation rules (tool-agnostic)
- **claude-extras.md**: graphify trigger (Claude-Code-specific)

### 7.8 `~/.claude/` allowlist

`.chezmoiignore` pattern (per [chezmoi#4916](https://github.com/twpayne/chezmoi/issues/4916)) — ignore everything, then un-ignore allowed paths, with `**/**` for deep unignores:

```gitignore
# Default-ignore under ~/.claude/
.claude/**

# Re-allow ancestor + tracked files/dirs
!.claude/
!.claude/CLAUDE.md
!.claude/settings.json
!.claude/.mcp.json
!.claude/hooks/
!.claude/hooks/**/**
!.claude/skills/
!.claude/skills/**/**
!.claude/mcp-servers/
!.claude/mcp-servers/**/**

# Belt-and-braces: explicitly never track these
.claude/.claude.json
.claude/settings.local.json
.claude/sessions/
.claude/projects/
.claude/tasks/
.claude/history.jsonl
.claude/compaction-log.jsonl
.claude/paste-cache/
.claude/file-history/
.claude/shell-snapshots/
.claude/session-env/
.claude/backups/
.claude/cache/
.claude/debug/
.claude/downloads/
.claude/ide/
.claude/plugins/
.claude/.last-cleanup
.claude/mcp-needs-auth-cache.json
```

Verify with `chezmoi ignored | grep claude` after each change.

## 8. Testing & rollback

### 8.1 Pre-apply

- `chezmoi diff` — git-style diff of (target state) vs (destination state)
- `chezmoi apply --dry-run` — runs scripts in dry mode
- `chezmoi verify` — exit 0 iff destination matches target

### 8.2 Per-machine sandbox before merging risky changes

1. Branch in dotfiles repo
2. `chezmoi git -- pull --rebase origin <branch>` then `chezmoi diff`
3. Apply, observe, fix
4. Merge to main

### 8.3 Rollback

- chezmoi tracks previous file versions in `~/.local/share/chezmoi/.chezmoistate.boltdb`
- Rollback to a past commit: `chezmoi git -- checkout <sha>` then `chezmoi apply`
- Brewfile rollback: `brew bundle --file=- < <(git show <sha>:Brewfile.tmpl | chezmoi execute-template)` then re-install
- macOS defaults: not auto-reversible; mitigation is keep script idempotent and self-documented

### 8.4 Guardrails

- `bootstrap.sh` refuses to re-run init if `~/.local/share/chezmoi/.git` already exists
- `chezmoi apply` runs with `--keep-going=false` so failing scripts halt the rest
- `op inject` failures don't crash shells (`|| echo` fallback) — broken 1Password = unfilled env vars + visible warning, not unusable shell
- `.gitignore` in repo includes `key.txt`, `*.local.json`, `*.cache`, `secrets/` belt-and-braces

## 9. Migration plan from current state

Order matters; each step is verifiable before the next.

1. **Repo scaffold** (this spec lives in `docs/specs/`)
2. **Brewfile seed**: `brew bundle dump` → manually shaped into `.chezmoidata/packages.yaml`
3. **Add chezmoi to Brewfile**, `brew install chezmoi` locally
4. **Configure chezmoi source directory** to `~/Work/Git/dotfiles` (honors user's "repos in `~/Work/Git/`" preference). Create `~/.config/chezmoi/chezmoi.toml` with:
   ```toml
   sourceDir = "/Users/jasonmatthew/Work/Git/dotfiles"
   ```
   Then `chezmoi init` (no remote yet) recognises the existing source dir. (On a fresh machine, the bootstrap one-liner uses chezmoi's default `~/.local/share/chezmoi`; the seed machine is the only place we override `sourceDir`. Future machines simply clone via `chezmoi init https://github.com/jasonm4130/dotfiles --apply`.)
5. **Add files to chezmoi one tool at a time** with `chezmoi add <path>`: zsh first, verify; then gitconfig, verify; then Zed; then Claude allowlist; then WezTerm/Starship (these are NEW so no risk)
6. **Test `chezmoi apply --dry-run`** after each addition; investigate any non-empty diff
7. **1Password vault setup**: create items for each Keychain secret in 1Password GUI
8. **Migrate Keychain → 1Password** via `scripts/migrate-keychain-to-1password.sh`
9. **Switch `.zshrc` from Keychain to `op inject`**: drop `_ks` function and Keychain-sourced exports; add `op inject` block. Open new shell, verify env vars
10. **Delete Keychain entries** after confirming all shell sessions work
11. **Switch p10k → Starship**: source `starship init zsh` instead of `.p10k.zsh`. Keep p10k archived
12. **Add WezTerm config**, restart WezTerm, verify
13. **macOS defaults script**: write, run, observe; iterate
14. **AGENTS.md split**: extract LSP-first rules from current `CLAUDE.md` into `~/.ai/AGENTS.md`; graphify section into `claude-extras.md`; render; verify `~/.claude/CLAUDE.md` is identical
15. **First commit + push public** (after final scan for accidentally committed secrets — `gitleaks detect` or `grep -r 'op://\|ghp_\|sk-' .`)
16. **Bootstrap test**: optionally test via fresh user account or VM; otherwise validate next time a clean macOS install happens

## 10. Open questions & risks

### Risks

1. **First `chezmoi apply` on the seed machine is destructive** — overwrites `~/.zshrc`, `~/.gitconfig`, etc. Mitigation: snapshot home dir / use `chezmoi diff` aggressively, apply one file at a time at first.
2. **brew bundle cleanup bug** ([Homebrew/brew#21350](https://github.com/homebrew/brew/issues/21350)) — addressed via opt-in alias.
3. **Public repo + Brewfile leakage** — Brewfile lists installed software, low-stakes but visible. Acceptable.
4. **AGENTS.md drift** — every push updates AGENTS.md publicly. Not a security risk; awareness only.
5. **chezmoi learning curve** — Go templates, three-state model, ignore semantics. Mitigation: spec captures the patterns; cheat-sheet in README.
6. **1Password lockout** — if 1Password is down or vault inaccessible, secrets are unloaded; shell still works but apps that need env vars (graphify, MCPs) won't. Acceptable failure mode.

### Deferred / not in v1

- `mise` migration from Volta + pyenv
- `age`-encrypted files (no immediate use case)
- Linux support
- Work / personal machine templating (will become relevant when 2nd machine arrives)
- Cursor / Codex / Gemini config files (placeholders in `~/.ai/` only)

### Open questions

- **Brewfile seed format**: keep YAML in `.chezmoidata/` or hand-author Brewfile.tmpl directly? YAML keeps the "single source" promise but adds a render step. Decision: YAML.
- **Per-machine config split**: defer until 2nd machine; chezmoi templates handle this when the time comes.
- **Repo name**: `dotfiles` (default) vs more specific (`mac-dotfiles`, `personal-dotfiles`). Defaulting to `dotfiles`.

---

## Appendix A — Sources cited

- chezmoi: <https://chezmoi.io>
- chezmoi#4916 — `.chezmoiignore` allowlist semantics: <https://github.com/twpayne/chezmoi/issues/4916>
- Homebrew/brew#21350 — `brew bundle cleanup` bug: <https://github.com/homebrew/brew/issues/21350>
- 1Password CLI secrets-scripts: <https://developer.1password.com/docs/cli/secrets-scripts>
- Magarcia, "Stop Hardcoding Secrets in Your zshrc" (2026-02): <https://magarcia.io/stop-hardcoding-secrets-in-your-zshrc/>
- Mike Kasberg, "Dotfiles Secrets in Chezmoi" (2026-01): <https://www.mikekasberg.com/blog/2026/01/31/dotfiles-secrets-in-chezmoi.html>
- Dave Beckett, "Eight Coding LLM Tools, One Configuration" (2026-03): <https://www.dajobe.org/blog/2026/03/16/eight-coding-llm-tools-one-configuration/>
- AGENTS.md spec: <https://agentsmd.io/what-is-agents-md>
- macos-defaults.com: <https://macos-defaults.com/>
