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
| Runtime version manager | **mise** (replaces Volta + pyenv) | Single polyglot tool; one config; faster shims; idiomatic 2025–26 choice. |
| Secret scanning | **gitleaks** (pre-commit hook + manual) | Pre-commit blocks accidental secret commits; config allowlists `op://` URIs (references, not secrets). |
| License | **MIT** | Most common for public personal dotfiles; GitHub auto-detects; permissive, well-understood. |
| Pre-apply backup | **rsync + Time Machine** | Explicit rsync of affected files into `~/dotfiles-backup-<date>/` before any `chezmoi apply`; Time Machine as second line. |
| Bootstrap reproducibility test | **VM test before public push** (UTM or Tart) | Clean macOS VM running the bootstrap one-liner end-to-end. Catches issues the seed machine masks (already-installed fonts, app integrations, brews). |

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
│   ├── git/{ignore,hooks/pre-commit}           # XDG path; pre-commit hook for gitleaks
│   ├── gitleaks/gitleaks.toml                  # secret-scan rules + op:// allowlist
│   └── mise/config.toml                        # global tool versions (replaces Volta + pyenv)
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
    - mise          # replaces Volta + pyenv
    - gitleaks      # secret scanning
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

### 7.8 Runtime version manager (mise)

**mise** replaces both Volta (Node) and pyenv (Python). Single tool, single config file, faster shim resolution, polyglot (Node/Python/Ruby/Go/Rust/Java/etc. all in one place).

**Global config** at `~/.config/mise/config.toml` (chezmoi-tracked):

```toml
[tools]
node   = "lts"
python = "3.13"
# Pin specific versions per project via local mise.toml at the repo root.

[settings]
experimental = true
legacy_version_file = true   # respects .nvmrc, .python-version, .tool-versions
```

**Shell activation** in `dot_zshrc.tmpl`:
```bash
eval "$(mise activate zsh)"
```

**`dot_zprofile`** (login shells, for GUI launchers):
```bash
eval "$(mise activate zsh --shims)"
```

**Per-project pinning** uses `mise.toml` at repo root (committed) or `.tool-versions` (compatible with asdf, nvm).

#### 7.8.1 Toolchain cleanup matrix

Audited on the seed machine 2026-05-08:

| Tool | Status / location | Action |
|---|---|---|
| **Volta** v1.0.8 (`~/.volta/`) | Manages node, npm, pnpm, yarn, pyright, typescript-language-server, sanity, tsc, tsserver | **Remove.** Migrate to mise. LSPs (pyright, typescript-language-server) handled by Zed automatic LSP install or brew. |
| **pyenv** (brew formula, `~/.pyenv/`, Python 3.13.12) | Active, single Python version installed | **Remove.** Migrate to mise. |
| **rust** (brew-installed `cargo`/`rustc`, `~/.cargo/`, no rustup) | Active | **Keep.** No version manager to remove. mise can install rust but rustup remains the canonical Rust toolchain manager — brew + cargo is fine for casual use. Reassess only if multi-version Rust becomes a need. |
| **bun** v1.3.12 (`~/.bun/`) | Self-managed | **Keep.** Bun manages itself via `bun upgrade`. |
| **Flutter / Dart** (brew) | Active | **Keep.** Flutter ships its own SDK and toolchain manager (`flutter sdk-tool`). |
| **gcloud SDK** (`~/google-cloud-sdk/`, Google's bash installer) | Active | **Keep.** Update `CLOUDSDK_PYTHON` env var to mise shim path during migration. |
| **nvm / fnm / n / asdf / jenv / rbenv** | Not installed | n/a |

#### 7.8.2 Migration sequence

Each step is reversible until the final delete; verify before proceeding.

**Migrate Node (Volta → mise)**:
1. List Volta-managed globals: `ls ~/.volta/bin` (excluding `volta`, `volta-shim`, `volta-migrate`)
2. Install mise + Node: `mise use --global node@lts pnpm@latest yarn@latest`
3. Open a new shell; verify `which node` resolves to `~/.local/share/mise/shims/node`
4. Reinstall Volta-managed npm globals as needed via `mise exec node -- npm install -g <pkg>` OR per-project (preferred). Skip LSPs (`pyright`, `typescript-language-server`, `tsc`) — Zed auto-installs them; Claude Code plugins ship their own
5. Test all repos with `package.json`: `cd <repo> && node --version && pnpm --version`
6. Remove Volta init from `dot_zshrc` (`VOLTA_HOME` block)
7. Verify in fresh shell: `which volta` returns nothing; `which node` is mise shim
8. Delete Volta data: `rm -rf ~/.volta` (no first-class uninstaller exists)

**Migrate Python (pyenv → mise)**:
1. Note current Python version: `pyenv version` (3.13.12)
2. `mise use --global python@3.13`
3. Verify: `which python` resolves to mise shim, `python --version` returns 3.13.x
4. Update `dot_zprofile`: `CLOUDSDK_PYTHON="$(mise which python)"` replacing `$PYENV_ROOT/shims/python3`
5. Test gcloud: `gcloud --version` runs cleanly
6. Test any Python projects in `~/Work/Git/`
7. Remove pyenv blocks from `dot_zshrc` and `dot_zprofile`
8. `brew uninstall pyenv`
9. `rm -rf ~/.pyenv` (data dir; gone with `pyenv uninstall` was per-version, this removes all)

**Update gcloud SDK Python**:
- Already covered above in pyenv migration step 4. The `CLOUDSDK_PYTHON` change is the only gcloud-related dotfile update; SDK itself stays at `~/google-cloud-sdk/`.

**Rollback (if mise misbehaves)**:
- Volta data is `rm -rf`'d in step 8; before that, `which volta` keeps working. Until step 8, you can revert by re-adding `VOLTA_HOME` to `.zshrc`.
- pyenv data deleted in step 9; before that, `brew install pyenv` would restore the formula but not installed Python builds. Mitigation: don't delete `~/.pyenv` until you've used mise-managed Python in every active project for at least a few days.

### 7.9 Secret scanning (gitleaks + pre-commit hook)

**Defence-in-depth**: even with the no-plaintext design, a pre-commit hook catches accidents (a hardcoded token pasted while debugging, a `.env` file `git add`ed by reflex).

**Tool**: gitleaks. Single Go binary via brew, fast, well-maintained, default rules cover OpenAI/Anthropic/AWS/GCP/GitHub/Stripe/Slack patterns.

**Hook approach**: native git `core.hooksPath`, NOT the `pre-commit` framework. Simpler for a personal repo, no Python dependency.

`dot_gitconfig.tmpl` adds:
```ini
[core]
    hooksPath = ~/.config/git/hooks
```

`private_dot_config/git/hooks/pre-commit` (chezmoi-tracked, +x):
```bash
#!/usr/bin/env bash
set -e
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --config "$HOME/.config/gitleaks/gitleaks.toml" || {
    echo ""
    echo "❌ gitleaks blocked the commit — secret detected."
    echo "   Review with: gitleaks protect --staged --verbose"
    echo "   If false positive, allowlist in ~/.config/gitleaks/gitleaks.toml"
    exit 1
  }
else
  echo "⚠ gitleaks not installed — skipping secret scan"
fi
```

`private_dot_config/gitleaks/gitleaks.toml`:
```toml
title = "Personal gitleaks config"

# Inherit gitleaks default ruleset
[extend]
useDefault = true

# Allowlist op:// URIs — these are references, not secrets
[allowlist]
description = "1Password URIs and well-known false positives"
regexes = [
  '''op://[A-Za-z0-9_/-]+''',          # op://Vault/Item/field
]
paths = [
  '''docs/specs/.*\.md''',             # spec docs may contain example secrets
  '''.*\.example''',                   # *.example placeholder files
]
```

**Repo-wide scan** (manual, for sanity-check before public push):
```bash
gitleaks detect --redact --config ~/.config/gitleaks/gitleaks.toml
```

**Migration plan reflection**: section 9 step 15 ("scan for accidentally committed secrets") becomes a `gitleaks detect` run.

### 7.10 `~/.claude/` allowlist

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

1. **Repo scaffold** (this spec lives in `docs/specs/`); add MIT `LICENSE` and seed `README.md` with bootstrap one-liner placeholder
2. **Pre-flight backup** of seed machine before any chezmoi work touches `$HOME`:
   ```bash
   BACKUP=~/dotfiles-backup-$(date +%Y-%m-%d)
   mkdir -p "$BACKUP"
   rsync -aR ~/.zshrc ~/.zshenv ~/.zprofile ~/.gitconfig ~/.gitignore_global ~/.p10k.zsh "$BACKUP/"
   rsync -aR ~/.config/zed "$BACKUP/"
   rsync -aR --exclude='sessions' --exclude='paste-cache' --exclude='file-history' \
              --exclude='shell-snapshots' --exclude='session-env' --exclude='history.jsonl' \
              ~/.claude "$BACKUP/"
   echo "backup at $BACKUP ($(du -sh "$BACKUP" | cut -f1))"
   ```
   Confirm Time Machine ran in the last 24h (`tmutil latestbackup`).
3. **Brewfile seed**: `brew bundle dump` → manually shaped into `.chezmoidata/packages.yaml`
4. **Add chezmoi to Brewfile**, `brew install chezmoi` locally
5. **Configure chezmoi source directory** to `~/Work/Git/dotfiles` (honors user's "repos in `~/Work/Git/`" preference). Create `~/.config/chezmoi/chezmoi.toml` with:
   ```toml
   sourceDir = "/Users/jasonmatthew/Work/Git/dotfiles"
   ```
   Then `chezmoi init` (no remote yet) recognises the existing source dir. (On a fresh machine, the bootstrap one-liner uses chezmoi's default `~/.local/share/chezmoi`; the seed machine is the only place we override `sourceDir`. Future machines simply clone via `chezmoi init https://github.com/jasonm4130/dotfiles --apply`.)
6. **Add files to chezmoi one tool at a time** with `chezmoi add <path>`: zsh first, verify; then gitconfig, verify; then Zed; then Claude allowlist; then WezTerm/Starship (these are NEW so no risk)
7. **Test `chezmoi apply --dry-run`** after each addition; investigate any non-empty diff
8. **1Password vault setup**: create items for each Keychain secret in 1Password GUI
9. **Migrate Keychain → 1Password** via `scripts/migrate-keychain-to-1password.sh`
10. **Switch `.zshrc` from Keychain to `op inject`**: drop `_ks` function and Keychain-sourced exports; add `op inject` block. Open new shell, verify env vars
11. **Delete Keychain entries** after confirming all shell sessions work
12. **Switch p10k → Starship**: source `starship init zsh` instead of `.p10k.zsh`. Keep p10k archived
13. **mise migration + toolchain cleanup** (per Section 7.8.1 matrix and 7.8.2 sequence): install mise, migrate Node from Volta and Python from pyenv, update `CLOUDSDK_PYTHON`, verify all repos resolve correct versions, then delete `~/.volta`, `brew uninstall pyenv`, and `rm -rf ~/.pyenv`. Rust, Bun, Flutter, gcloud SDK stay as-is.
14. **Add WezTerm config**, restart WezTerm, verify
15. **macOS defaults script**: write, run, observe; iterate
16. **AGENTS.md split**: extract LSP-first rules from current `CLAUDE.md` into `~/.ai/AGENTS.md`; graphify section into `claude-extras.md`; render; verify `~/.claude/CLAUDE.md` is identical
17. **gitleaks pre-commit hook**: install gitleaks, create `~/.config/gitleaks/gitleaks.toml` (with `op://` allowlist), set `core.hooksPath`, install `pre-commit` script (per Section 7.9). Verify the hook fires by attempting to commit a fake secret in a sandbox branch
18. **Final repo-wide secret scan**: `gitleaks detect --redact` against full repo + history
19. **VM bootstrap test**: spin up a clean macOS VM via [UTM](https://mac.getutm.app/) or [Tart](https://tart.run/), run the bootstrap one-liner against the unpushed branch (use a private fork or local serve to test before public). Confirm the bootstrap completes without manual intervention beyond the documented one-time steps (1Password CLI integration enable, App Store sign-in). Fix anything that breaks.
20. **First commit + push public** to `github.com/jasonm4130/dotfiles` with MIT license, README, and the validated bootstrap one-liner

## 10. Open questions & risks

### Risks

1. **First `chezmoi apply` on the seed machine is destructive** — overwrites `~/.zshrc`, `~/.gitconfig`, etc. Mitigation: pre-flight rsync backup (Section 9 step 2), Time Machine confirmation, `chezmoi diff` aggressively, apply one file at a time at first.
2. **brew bundle cleanup bug** ([Homebrew/brew#21350](https://github.com/homebrew/brew/issues/21350)) — addressed via opt-in alias.
3. **Public repo + Brewfile leakage** — Brewfile lists installed software, low-stakes but visible. Acceptable.
4. **AGENTS.md drift** — every push updates AGENTS.md publicly. Not a security risk; awareness only.
5. **chezmoi learning curve** — Go templates, three-state model, ignore semantics. Mitigation: spec captures the patterns; cheat-sheet in README.
6. **1Password lockout** — if 1Password is down or vault inaccessible, secrets are unloaded; shell still works but apps that need env vars (graphify, MCPs) won't. Acceptable failure mode.

### Deferred / not in v1

- `age`-encrypted files (no immediate use case)
- Linux support
- Work / personal machine templating (will become relevant when 2nd machine arrives)
- Cursor / Codex / Gemini config files (placeholders in `~/.ai/` only)
- CI-level secret scanning (GitHub Actions running gitleaks on push) — pre-commit covers locally; CI is belt-and-braces for if a hook is bypassed

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
