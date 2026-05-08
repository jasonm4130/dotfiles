# Dotfiles Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public chezmoi-managed dotfiles repo at `~/Work/Git/dotfiles` that takes a fresh macOS Apple Silicon machine to a fully provisioned dev environment with one command, and migrate the seed machine onto it without losing any working state.

**Architecture:** chezmoi as dotfile manager, with sourceDir pointed at `~/Work/Git/dotfiles`. Public GitHub repo. 1Password CLI for runtime secrets via inline `op inject`. mise replaces Volta + pyenv. Starship replaces Powerlevel10k. AGENTS.md as the single source rendered into per-tool AI configs. gitleaks pre-commit hook. Bootstrap entry: `sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply jasonm4130`.

**Tech Stack:** chezmoi, Homebrew, 1Password CLI (`op`), age (deferred), gitleaks, mise, Starship, WezTerm, Zed, Claude Code, zsh + Oh My Zsh, Go templates (chezmoi).

**Spec:** `docs/specs/2026-05-08-dotfiles-design.md` — read this first; this plan is the execution of that spec's 20-step migration.

**Pre-conditions on the seed machine** (already true at plan-write time):
- Homebrew installed at `/opt/homebrew`
- 1Password app installed; `op` CLI v2.34.0 available; **CLI integration NOT yet enabled in the desktop app**
- Repo skeleton exists at `~/Work/Git/dotfiles` with `docs/specs/` and `docs/plans/` populated
- Git initialized on `main` branch; user.name and user.email already set
- No `chezmoi`, `mise`, `gitleaks`, `starship`, or `age` installed yet

**Working state contract:** every task ends with the seed machine in a working state. Don't proceed to the next task if the current one's verification fails — debug, fix, then proceed.

**Conventions:**
- All paths absolute. `~` expanded to `/Users/jasonmatthew` where shell wouldn't expand it.
- Code blocks marked `bash` are literal commands. Code blocks marked `lua`/`toml`/`json`/`jinja`/etc. are file contents.
- "**Verify**" steps are mandatory smoke tests, not TDD-style assertions. They confirm the change took effect without breaking anything.
- Commit after every task. Branch only when explicitly noted.

---

## Phase 1 — Repo scaffolding

### Task 1: Create LICENSE, README skeleton, .gitignore

**Files:**
- Create: `~/Work/Git/dotfiles/LICENSE`
- Create: `~/Work/Git/dotfiles/README.md`
- Create: `~/Work/Git/dotfiles/.gitignore`

- [ ] **Step 1: Create the MIT LICENSE file**

```bash
cat > ~/Work/Git/dotfiles/LICENSE <<'EOF'
MIT License

Copyright (c) 2026 Jason Matthew

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
```

- [ ] **Step 2: Create the README skeleton**

```bash
cat > ~/Work/Git/dotfiles/README.md <<'EOF'
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

## Design

See [`docs/specs/2026-05-08-dotfiles-design.md`](docs/specs/2026-05-08-dotfiles-design.md).

## License

MIT — see [LICENSE](LICENSE).
EOF
```

- [ ] **Step 3: Create the .gitignore**

```bash
cat > ~/Work/Git/dotfiles/.gitignore <<'EOF'
# chezmoi state
.chezmoistate.boltdb

# Local-only secrets (belt-and-braces — these should never be added)
*.local.json
*.cache
key.txt
secrets/
.env
.env.local

# macOS noise
.DS_Store

# Editor cruft
.vscode/
.idea/

# Brewfile lockfile (we use --no-lock)
Brewfile.lock.json
EOF
```

- [ ] **Step 4: Verify files exist and look right**

Run:
```bash
ls -la ~/Work/Git/dotfiles
head -3 ~/Work/Git/dotfiles/LICENSE
head -3 ~/Work/Git/dotfiles/README.md
cat ~/Work/Git/dotfiles/.gitignore
```
Expected: LICENSE starts with "MIT License", README starts with "# Dotfiles", .gitignore lists chezmoi state.

- [ ] **Step 5: Commit**

```bash
cd ~/Work/Git/dotfiles
git add LICENSE README.md .gitignore
git commit -m "chore: add MIT license, README skeleton, .gitignore"
```

---

### Task 2: Pre-flight backup of seed machine

**Files:**
- Create: `~/dotfiles-backup-2026-05-08/` (NOT in repo; transient backup)

- [ ] **Step 1: Confirm Time Machine ran recently**

Run:
```bash
tmutil latestbackup 2>/dev/null || echo "NO TIME MACHINE BACKUP FOUND"
```
Expected: a path like `/Volumes/Backups/2026-05-08-...`. If "NO TIME MACHINE BACKUP FOUND", run a backup now (`tmutil startbackup --block`) before proceeding. Without Time Machine, halt the plan and ask the user.

- [ ] **Step 2: Create rsync backup of affected files**

Run:
```bash
BACKUP=~/dotfiles-backup-$(date +%Y-%m-%d)
mkdir -p "$BACKUP"
rsync -aR \
  ~/.zshrc ~/.zshenv ~/.zprofile \
  ~/.gitconfig ~/.gitignore_global \
  ~/.p10k.zsh \
  "$BACKUP/"
rsync -aR ~/.config/zed "$BACKUP/"
rsync -aR \
  --exclude='sessions' --exclude='paste-cache' --exclude='file-history' \
  --exclude='shell-snapshots' --exclude='session-env' --exclude='history.jsonl' \
  --exclude='compaction-log.jsonl' --exclude='backups' --exclude='cache' \
  ~/.claude "$BACKUP/"
echo "backup at $BACKUP ($(du -sh "$BACKUP" | cut -f1))"
```
Expected: prints the backup path and size (likely 1–10 MB once heavy `~/.claude` runtime dirs are excluded).

- [ ] **Step 3: Verify backup contents**

Run:
```bash
ls -R ~/dotfiles-backup-$(date +%Y-%m-%d) | head -40
```
Expected: shows `.zshrc`, `.zshenv`, `.zprofile`, `.gitconfig`, `.p10k.zsh`, `.config/zed/settings.json`, `.claude/CLAUDE.md`, `.claude/settings.json`, etc.

- [ ] **Step 4: Note backup location in repo (no commit; this is operational)**

The backup is OUTSIDE the repo and intentionally not tracked. Note its path in your terminal scrollback / a sticky note. If anything goes wrong later, restore by `rsync -a ~/dotfiles-backup-YYYY-MM-DD/Users/jasonmatthew/ ~/`.

No commit for this task.

---

### Task 3: Seed `.chezmoidata/packages.yaml` from current Homebrew state

**Files:**
- Create: `~/Work/Git/dotfiles/.chezmoidata/packages.yaml`

- [ ] **Step 1: Dump current Brewfile**

Run:
```bash
brew bundle dump --file=/tmp/Brewfile.dump --force
wc -l /tmp/Brewfile.dump
head -20 /tmp/Brewfile.dump
```
Expected: a Brewfile with hundreds of `tap`/`brew`/`cask`/`mas` lines.

- [ ] **Step 2: Create the chezmoidata directory**

```bash
mkdir -p ~/Work/Git/dotfiles/.chezmoidata
```

- [ ] **Step 3: Convert Brewfile dump to packages.yaml manually**

Open `/tmp/Brewfile.dump` and `~/Work/Git/dotfiles/.chezmoidata/packages.yaml` side-by-side. Build the YAML by hand (one-time effort; future edits will be done directly in YAML).

Use this template, filling lists from the dump:

```yaml
brew:
  taps:
    - homebrew/bundle
    # ... copy each `tap "..."` line as `- "..."`
  formulae:
    # NEW additions for this project (these may not be in the dump yet):
    - chezmoi
    - age
    - starship
    - mise
    - gitleaks
    - 1password-cli
    # ... copy each `brew "..."` line from the dump as `- "..."`
  casks:
    # NEW additions:
    - 1password
    - wezterm
    - claude-code
    - font-monaspace-nerd-font
    - font-jetbrains-mono-nerd-font
    - font-iosevka-nerd-font
    # ... copy each `cask "..."` line from the dump as `- "..."`
  mas:
    # Each `mas "Name", id: 12345` line becomes:
    # - { name: "Name", id: 12345 }
```

Write the result to `~/Work/Git/dotfiles/.chezmoidata/packages.yaml`. Sort each list alphabetically (with NEW items in their alphabetical position, not segregated).

- [ ] **Step 4: Verify YAML is valid**

Run:
```bash
python3 -c "import yaml; d = yaml.safe_load(open('$HOME/Work/Git/dotfiles/.chezmoidata/packages.yaml')); print(f\"taps={len(d['brew']['taps'])}, formulae={len(d['brew']['formulae'])}, casks={len(d['brew']['casks'])}, mas={len(d['brew'].get('mas', []))}\")"
```
Expected: prints counts (e.g. `taps=4, formulae=180, casks=130, mas=10`).

- [ ] **Step 5: Verify NEW additions present**

Run:
```bash
grep -E '^\s*-\s*(chezmoi|age|starship|mise|gitleaks|1password-cli|wezterm|claude-code|font-monaspace)' ~/Work/Git/dotfiles/.chezmoidata/packages.yaml
```
Expected: 9 matches. If any missing, add them.

- [ ] **Step 6: Commit**

```bash
cd ~/Work/Git/dotfiles
git add .chezmoidata/packages.yaml
git commit -m "feat(brew): seed packages.yaml from current Homebrew state + chezmoi/mise/gitleaks/etc additions"
```

---

## Phase 2 — chezmoi installation & initial setup

### Task 4: Install chezmoi locally

**Files:**
- None modified (system change only)

- [ ] **Step 1: Install chezmoi via Homebrew**

```bash
brew install chezmoi
```
Expected: chezmoi installed (no error).

- [ ] **Step 2: Verify install**

```bash
chezmoi --version
```
Expected: prints `chezmoi version v2.x.x` (likely 2.70.x or newer).

- [ ] **Step 3: Install age too (we'll use it later if needed)**

```bash
brew install age
age --version
```
Expected: prints `age v1.x.x`.

No commit (system change, not repo change).

---

### Task 5: Configure chezmoi sourceDir to point at `~/Work/Git/dotfiles`

**Files:**
- Create: `~/.config/chezmoi/chezmoi.toml`

- [ ] **Step 1: Create the chezmoi config directory**

```bash
mkdir -p ~/.config/chezmoi
```

- [ ] **Step 2: Write the config**

```bash
cat > ~/.config/chezmoi/chezmoi.toml <<EOF
sourceDir = "$HOME/Work/Git/dotfiles"
EOF
```

- [ ] **Step 3: Verify chezmoi recognises the source dir**

```bash
chezmoi source-path
```
Expected: prints `/Users/jasonmatthew/Work/Git/dotfiles`.

- [ ] **Step 4: Verify chezmoi sees no managed files yet**

```bash
chezmoi managed | head
chezmoi unmanaged | head
```
Expected: `managed` shows nothing or only the .gitignore et al. that we created. `unmanaged` lists everything in `$HOME` that isn't tracked yet.

No commit (system config change, not repo change).

---

### Task 6: Add chezmoi data file for templating prompts

**Files:**
- Create: `~/Work/Git/dotfiles/.chezmoi.toml.tmpl`

This file is the template for the chezmoi config (`~/.config/chezmoi/chezmoi.toml`). On a fresh machine, chezmoi `init` evaluates this template and writes the config. On the seed machine, we ALREADY wrote the config manually in Task 5; this template is for future machines.

- [ ] **Step 1: Write the chezmoi.toml template**

```bash
cat > ~/Work/Git/dotfiles/.chezmoi.toml.tmpl <<'EOF'
{{- $hostname := promptStringOnce . "hostname_tag" "Hostname tag (personal/work)" "personal" -}}
{{- $email := promptStringOnce . "git_email" "Git email" "jasonm4130@gmail.com" -}}
{{- $github := promptStringOnce . "github_user" "GitHub username" "jasonm4130" -}}

[data]
  hostname_tag = {{ $hostname | quote }}
  git_email    = {{ $email    | quote }}
  github_user  = {{ $github   | quote }}
EOF
```

- [ ] **Step 2: Verify template renders without error using current data**

```bash
chezmoi execute-template < ~/Work/Git/dotfiles/.chezmoi.toml.tmpl
```
Expected: prints rendered TOML with the default values (chezmoi will use defaults non-interactively).

- [ ] **Step 3: Commit**

```bash
cd ~/Work/Git/dotfiles
git add .chezmoi.toml.tmpl
git commit -m "feat(chezmoi): add config template with init prompts for hostname/email/github_user"
```

---

## Phase 3 — Track existing dotfiles (no behavior change)

### Task 7: Track shell configs (zshrc, zshenv, zprofile, p10k.zsh)

**Files:**
- Create: `~/Work/Git/dotfiles/dot_zshrc`
- Create: `~/Work/Git/dotfiles/dot_zshenv`
- Create: `~/Work/Git/dotfiles/dot_zprofile`
- Create: `~/Work/Git/dotfiles/dot_p10k.zsh`

The chezmoi `dot_` prefix maps `dot_zshrc` → `~/.zshrc` etc.

- [ ] **Step 1: Add each file to chezmoi (copies, doesn't move)**

```bash
chezmoi add ~/.zshrc
chezmoi add ~/.zshenv
chezmoi add ~/.zprofile
chezmoi add ~/.p10k.zsh
```
Expected: no output. Each command silently copies the file into the source dir with the `dot_` prefix.

- [ ] **Step 2: Verify the files were added correctly**

```bash
ls -la ~/Work/Git/dotfiles/dot_zshrc ~/Work/Git/dotfiles/dot_zshenv ~/Work/Git/dotfiles/dot_zprofile ~/Work/Git/dotfiles/dot_p10k.zsh
chezmoi managed
```
Expected: 4 files visible in repo (~96K dot_p10k.zsh confirms it's the real file, not empty). `chezmoi managed` lists `~/.zshrc`, `~/.zshenv`, `~/.zprofile`, `~/.p10k.zsh`.

- [ ] **Step 3: Verify no diff (we copied current state, so destination matches)**

```bash
chezmoi diff
```
Expected: empty output. If anything is shown, investigate (line ending differences, etc.).

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add dot_zshrc dot_zshenv dot_zprofile dot_p10k.zsh
git commit -m "feat(zsh): track current shell configs as-is (no behavior change)"
```

---

### Task 8: Track gitconfig and gitignore_global

**Files:**
- Create: `~/Work/Git/dotfiles/dot_gitconfig`
- Create: `~/Work/Git/dotfiles/dot_gitignore_global` (only if it exists)

- [ ] **Step 1: Check if gitignore_global exists**

```bash
ls -la ~/.gitignore_global 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

If MISSING, create it as an empty file referenced by .gitconfig:

```bash
touch ~/.gitignore_global
```

- [ ] **Step 2: Add both to chezmoi**

```bash
chezmoi add ~/.gitconfig
chezmoi add ~/.gitignore_global
```

- [ ] **Step 3: Verify**

```bash
chezmoi diff
ls ~/Work/Git/dotfiles/dot_gitconfig ~/Work/Git/dotfiles/dot_gitignore_global
```
Expected: empty diff; both files present.

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add dot_gitconfig dot_gitignore_global
git commit -m "feat(git): track gitconfig and gitignore_global"
```

---

### Task 9: Track Zed config (current state — improved later)

**Files:**
- Create: `~/Work/Git/dotfiles/private_dot_config/zed/{settings.json,keymap.json}`
- Create: `~/Work/Git/dotfiles/private_dot_config/zed/{prompts,themes}/`

The `private_` prefix sets file mode 0700 for the directory, 0600 for files within.

- [ ] **Step 1: Add the Zed config directory**

```bash
chezmoi add ~/.config/zed/settings.json
chezmoi add ~/.config/zed/keymap.json
chezmoi add ~/.config/zed/prompts
chezmoi add ~/.config/zed/themes
```
Expected: each `chezmoi add` succeeds silently.

- [ ] **Step 2: Verify path**

```bash
ls -la ~/Work/Git/dotfiles/private_dot_config/zed/
chezmoi diff
```
Expected: shows `settings.json`, `keymap.json`, `prompts/`, `themes/`. Empty diff.

- [ ] **Step 3: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/zed
git commit -m "feat(zed): track current Zed config (settings, keymap, prompts, themes)"
```

---

### Task 10: Set up `.chezmoiignore` with the `~/.claude/` allowlist

**Files:**
- Create: `~/Work/Git/dotfiles/.chezmoiignore`

This is the critical file that lets us track parts of `~/.claude/` while ignoring runtime state. Done BEFORE adding `.claude/` so chezmoi doesn't pull in the runtime junk.

- [ ] **Step 1: Write the .chezmoiignore**

```bash
cat > ~/Work/Git/dotfiles/.chezmoiignore <<'EOF'
# === ~/.claude/ allowlist (chezmoi#4916 pattern) ===
# Default: ignore everything under .claude
.claude/**

# Re-allow ancestor + tracked files/dirs (deep paths use **/**)
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

# Belt-and-braces: explicit re-ignores (for safety even though parent ignore covers them)
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

# === Other ignores ===
# Local-only secrets (never tracked)
.cache/secrets/
EOF
```

- [ ] **Step 2: Verify chezmoi sees the ignores**

```bash
chezmoi ignored | grep '\.claude/' | head -20
```
Expected: lists ignored paths under `.claude/` (sessions, history.jsonl, etc.).

- [ ] **Step 3: Verify the allowlist is correct (these should NOT be in `chezmoi ignored`)**

```bash
chezmoi ignored | grep -E '\.claude/(CLAUDE\.md|settings\.json|hooks/|skills/)' || echo "OK: not ignored (as expected)"
```
Expected: prints `OK: not ignored (as expected)`. If any of those files appear in ignored, the pattern is wrong — fix before continuing.

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add .chezmoiignore
git commit -m "feat(chezmoi): add .claude/ allowlist via chezmoiignore (issue #4916 pattern)"
```

---

### Task 11: Track Claude Code config

**Files:**
- Create: `~/Work/Git/dotfiles/private_dot_claude/CLAUDE.md`
- Create: `~/Work/Git/dotfiles/private_dot_claude/settings.json`
- Create: `~/Work/Git/dotfiles/private_dot_claude/dot_mcp.json` (chezmoi maps `dot_` → leading dot)
- Create: `~/Work/Git/dotfiles/private_dot_claude/hooks/{session-start.sh,pre-compact.sh,lsp-first-guard.js}`
- Create: `~/Work/Git/dotfiles/private_dot_claude/skills/graphify/...`
- Create: `~/Work/Git/dotfiles/private_dot_claude/mcp-servers/...`

- [ ] **Step 1: Add the allowed Claude files via chezmoi**

```bash
chezmoi add ~/.claude/CLAUDE.md
chezmoi add ~/.claude/settings.json
chezmoi add ~/.claude/.mcp.json
chezmoi add ~/.claude/hooks
chezmoi add ~/.claude/skills
chezmoi add ~/.claude/mcp-servers
```
Expected: silent success each time.

- [ ] **Step 2: Confirm runtime files were NOT pulled in**

```bash
ls ~/Work/Git/dotfiles/private_dot_claude/
ls ~/Work/Git/dotfiles/private_dot_claude/ | grep -E '(sessions|history|paste-cache|file-history|backups|cache|projects|tasks|\.claude\.json)' && echo "❌ PROBLEM: runtime files leaked" || echo "✅ runtime files correctly excluded"
```
Expected: `✅ runtime files correctly excluded`. If problem, re-check `.chezmoiignore` (Task 10) and remove leaked dirs from `private_dot_claude/`.

- [ ] **Step 3: Verify chezmoi diff is clean**

```bash
chezmoi diff
```
Expected: empty diff (we added current files, destination already matches).

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_claude
git commit -m "feat(claude): track CLAUDE.md, settings.json, hooks, skills, mcp-servers (allowlist via chezmoiignore)"
```

---

## Phase 4 — New configs & build scripts

### Task 12: Write `Brewfile.tmpl` rendered from packages.yaml

**Files:**
- Create: `~/Work/Git/dotfiles/Brewfile.tmpl`

- [ ] **Step 1: Write the template**

```bash
cat > ~/Work/Git/dotfiles/Brewfile.tmpl <<'EOF'
# This file is generated by chezmoi from .chezmoidata/packages.yaml.
# Edit the YAML, not this file.

{{- range .brew.taps }}
tap "{{ . }}"
{{- end }}

{{ range .brew.formulae }}
brew "{{ . }}"
{{- end }}

{{ range .brew.casks }}
cask "{{ . }}"
{{- end }}

{{ range .brew.mas }}
mas "{{ .name }}", id: {{ .id }}
{{- end }}
EOF
```

- [ ] **Step 2: Render and inspect**

```bash
chezmoi execute-template --file ~/Work/Git/dotfiles/Brewfile.tmpl | head -30
chezmoi execute-template --file ~/Work/Git/dotfiles/Brewfile.tmpl | wc -l
```
Expected: prints lines like `tap "homebrew/bundle"`, `brew "chezmoi"`, etc. Line count roughly matches the dump from Task 3.

- [ ] **Step 3: Verify the rendered Brewfile is valid for `brew bundle check`**

```bash
chezmoi execute-template --file ~/Work/Git/dotfiles/Brewfile.tmpl > /tmp/Brewfile.rendered
brew bundle check --file=/tmp/Brewfile.rendered || echo "SOME PACKAGES NOT INSTALLED YET (expected for new additions)"
```
Expected: lists missing packages (chezmoi already installed, but mise, gitleaks, starship, age, font-* may be missing). That's fine — we install them in a later task.

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add Brewfile.tmpl
git commit -m "feat(brew): add Brewfile.tmpl rendered from packages.yaml"
```

---

### Task 13: Install the new Brew packages now (via the rendered Brewfile)

**Files:**
- None (system change)

This is a one-time install of the NEW packages added to packages.yaml. Subsequent runs will be handled by `run_onchange_before_02-brew-bundle.sh.tmpl` (Task 17).

- [ ] **Step 1: Run brew bundle from the rendered Brewfile**

```bash
chezmoi execute-template --file ~/Work/Git/dotfiles/Brewfile.tmpl > /tmp/Brewfile.rendered
brew bundle --file=/tmp/Brewfile.rendered --no-lock
```
Expected: installs missing packages (mise, gitleaks, starship, age, fonts, etc.). Takes 2–10 minutes depending on what's missing.

- [ ] **Step 2: Verify each new tool**

```bash
mise --version
gitleaks version
starship --version
age --version
which wezterm zed
```
Expected: every command prints a version (no "command not found"). wezterm + zed should already have been installed.

No commit (system change).

---

### Task 14: Write WezTerm config

**Files:**
- Create: `~/Work/Git/dotfiles/private_dot_config/wezterm/wezterm.lua`

- [ ] **Step 1: Write the config**

```bash
mkdir -p ~/Work/Git/dotfiles/private_dot_config/wezterm
cat > ~/Work/Git/dotfiles/private_dot_config/wezterm/wezterm.lua <<'EOF'
local wezterm = require 'wezterm'
local config = wezterm.config_builder()

-- Font (Monaspace Neon, matches Zed)
config.font = wezterm.font_with_fallback {
  { family = 'Monaspace Neon',     harfbuzz_features = { 'calt', 'liga', 'ss01', 'ss02', 'ss03' } },
  { family = 'Symbols Nerd Font Mono' },
}
config.font_size = 14.0
config.line_height = 1.3

-- Theme
config.color_scheme = 'Catppuccin Mocha'

-- Window chrome
config.window_decorations = 'RESIZE'
config.window_background_opacity = 0.97
config.macos_window_background_blur = 20
config.window_padding = { left = 12, right = 12, top = 8, bottom = 4 }
config.hide_tab_bar_if_only_one_tab = true
config.use_fancy_tab_bar = false

-- Behavior
config.scrollback_lines = 50000
config.audible_bell = 'Disabled'
config.adjust_window_size_when_changing_font_size = false
config.send_composed_key_when_left_alt_is_pressed = true   -- option-key for chars
config.send_composed_key_when_right_alt_is_pressed = false -- right-option as Meta

-- Keybindings (tmux-style splits, command palette)
local act = wezterm.action
config.keys = {
  { key = 'd', mods = 'CMD',       action = act.SplitHorizontal { domain = 'CurrentPaneDomain' } },
  { key = 'd', mods = 'CMD|SHIFT', action = act.SplitVertical   { domain = 'CurrentPaneDomain' } },
  { key = 'w', mods = 'CMD',       action = act.CloseCurrentPane { confirm = true } },
  { key = 'h', mods = 'CMD|ALT',   action = act.ActivatePaneDirection 'Left' },
  { key = 'l', mods = 'CMD|ALT',   action = act.ActivatePaneDirection 'Right' },
  { key = 'k', mods = 'CMD|ALT',   action = act.ActivatePaneDirection 'Up' },
  { key = 'j', mods = 'CMD|ALT',   action = act.ActivatePaneDirection 'Down' },
  { key = 'p', mods = 'CMD|SHIFT', action = act.ActivateCommandPalette },
}

return config
EOF
```

- [ ] **Step 2: Apply via chezmoi (writes to `~/.config/wezterm/wezterm.lua`)**

```bash
chezmoi diff
chezmoi apply
```
Expected: diff shows the new file being created. Apply succeeds.

- [ ] **Step 3: Verify WezTerm picks it up**

Open WezTerm (or restart if already open). Confirm:
- Font is Monaspace Neon (look at the digit `0` — should have a slash through it)
- Theme is dark, Catppuccin Mocha
- Window has subtle transparency + blur
- `Cmd+D` splits horizontally, `Cmd+Shift+D` splits vertically

If anything is wrong, check `wezterm cli show-config` and the WezTerm log (`Help → Show debug overlay`).

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/wezterm
git commit -m "feat(wezterm): add WezTerm config (Monaspace Neon, Catppuccin Mocha, tmux-style splits)"
```

---

### Task 15: Write Starship config

**Files:**
- Create: `~/Work/Git/dotfiles/private_dot_config/starship.toml`

This task only WRITES the config. Starship doesn't replace p10k until Task 30.

- [ ] **Step 1: Write starship.toml**

```bash
cat > ~/Work/Git/dotfiles/private_dot_config/starship.toml <<'EOF'
add_newline = true

format = """
$username\
$hostname\
$directory\
$git_branch\
$git_status\
$nodejs\
$python\
$rust\
$cmd_duration\
$line_break\
$character"""

[character]
success_symbol = "[❯](bold green)"
error_symbol   = "[❯](bold red)"

[directory]
truncation_length = 3
truncate_to_repo  = true
style             = "bold cyan"

[git_branch]
symbol = " "
style  = "bold purple"

[git_status]
ahead     = "⇡${count}"
behind    = "⇣${count}"
diverged  = "⇕⇡${ahead_count}⇣${behind_count}"
modified  = "*${count}"
untracked = "?${count}"
stashed   = "$${count}"

[cmd_duration]
min_time = 2000
format   = "took [$duration](yellow)"

[nodejs]
format = "via [⬢ $version](bold green) "

[python]
format = "via [🐍 $version](yellow bold) "

[rust]
format = "via [⚙ $version](red bold) "
EOF
```

- [ ] **Step 2: Apply**

```bash
chezmoi apply
ls ~/.config/starship.toml
```
Expected: file exists at `~/.config/starship.toml`.

- [ ] **Step 3: Smoke-test starship in a transient subshell (does not affect current shell)**

```bash
zsh -c 'eval "$(starship init zsh)"; print -P "%~"'
```
Expected: prints current directory; no errors.

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/starship.toml
git commit -m "feat(starship): add starship.toml (will replace p10k in a later task)"
```

---

### Task 16: Write `~/.ai/AGENTS.md` and the `render.sh` script

**Files:**
- Create: `~/Work/Git/dotfiles/dot_ai/AGENTS.md`
- Create: `~/Work/Git/dotfiles/dot_ai/claude-extras.md`
- Create: `~/Work/Git/dotfiles/dot_ai/codex-extras.md` (placeholder)
- Create: `~/Work/Git/dotfiles/dot_ai/executable_render.sh`

The `executable_` prefix tells chezmoi to apply +x.

- [ ] **Step 1: Write the canonical AGENTS.md (extracted from current ~/.claude/CLAUDE.md)**

```bash
mkdir -p ~/Work/Git/dotfiles/dot_ai
cat > ~/Work/Git/dotfiles/dot_ai/AGENTS.md <<'EOF'
# Coding Agent Instructions

Tool-agnostic instructions used by Claude Code, Codex, Gemini, etc.

## LSP-First Code Navigation

When working in code files (TS, JS, Python, Rust, Go, etc.):

1. Use LSP `goToDefinition` instead of grepping for function/class definitions
2. Use LSP `findReferences` instead of grepping for symbol usages
3. Use LSP `hover` to check types instead of reading entire files
4. Use LSP `documentSymbol` to understand file structure
5. Only use Grep for: text searches, TODOs, string literals, log messages, config values
6. Only fall back to Grep when LSP returns empty results or is unavailable
EOF
```

- [ ] **Step 2: Write the Claude-only extras**

```bash
cat > ~/Work/Git/dotfiles/dot_ai/claude-extras.md <<'EOF'

# Claude Code-Specific

## graphify

- **graphify** (`~/.claude/skills/graphify/SKILL.md`) — any input to knowledge graph. Trigger: `/graphify`
- When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
EOF
```

- [ ] **Step 3: Write the codex extras placeholder**

```bash
cat > ~/Work/Git/dotfiles/dot_ai/codex-extras.md <<'EOF'

# Codex-Specific

(No Codex-specific additions yet. Add here when adopting Codex.)
EOF
```

- [ ] **Step 4: Write render.sh**

```bash
cat > ~/Work/Git/dotfiles/dot_ai/executable_render.sh <<'EOF'
#!/usr/bin/env bash
# Render ~/.ai/AGENTS.md (+ tool-specific extras) into per-tool config files.
# Re-run automatically by chezmoi via run_onchange_after_07-agents-md-sync.
set -euo pipefail

AI_DIR="$HOME/.ai"

# Claude Code: AGENTS.md + claude-extras
mkdir -p "$HOME/.claude"
cat "$AI_DIR/AGENTS.md" "$AI_DIR/claude-extras.md" > "$HOME/.claude/CLAUDE.md"

# Codex: AGENTS.md only (codex reads this filename directly)
mkdir -p "$HOME/.codex"
cat "$AI_DIR/AGENTS.md" "$AI_DIR/codex-extras.md" > "$HOME/.codex/AGENTS.md"

echo "✅ rendered AGENTS.md → ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md"
EOF
```

- [ ] **Step 5: Apply via chezmoi**

```bash
chezmoi diff
chezmoi apply
ls ~/.ai/
```
Expected: `~/.ai/` exists with `AGENTS.md`, `claude-extras.md`, `codex-extras.md`, `render.sh` (executable).

- [ ] **Step 6: Verify render.sh works**

```bash
~/.ai/render.sh
diff ~/.claude/CLAUDE.md <(cat ~/.ai/AGENTS.md ~/.ai/claude-extras.md)
```
Expected: render runs without error; diff shows nothing (rendered file matches source concatenation).

- [ ] **Step 7: Commit**

```bash
cd ~/Work/Git/dotfiles
git add dot_ai
git commit -m "feat(ai): add unified AGENTS.md source + render.sh for per-tool generation"
```

---

### Task 17: Write all bootstrap scripts

**Files:**
- Create: `~/Work/Git/dotfiles/run_once_before_00-xcode-clt.sh`
- Create: `~/Work/Git/dotfiles/run_once_before_01-homebrew.sh`
- Create: `~/Work/Git/dotfiles/run_onchange_before_02-brew-bundle.sh.tmpl`
- Create: `~/Work/Git/dotfiles/run_onchange_after_03-fonts.sh.tmpl`
- Create: `~/Work/Git/dotfiles/run_once_after_05-shell-setup.sh`
- Create: `~/Work/Git/dotfiles/run_once_after_06-claude-plugins.sh`
- Create: `~/Work/Git/dotfiles/run_onchange_after_07-agents-md-sync.sh.tmpl`

Note: `run_once_after_04-macos-defaults.sh` is written separately in Task 28 (it's the longest).

- [ ] **Step 1: Xcode CLT installer**

```bash
cat > ~/Work/Git/dotfiles/run_once_before_00-xcode-clt.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if xcode-select -p >/dev/null 2>&1; then
  echo "✅ Xcode CLT already installed"
  exit 0
fi
echo "📥 Installing Xcode Command Line Tools..."
xcode-select --install
# Block until install finishes (check every 10s, max 30 min)
for _ in $(seq 1 180); do
  xcode-select -p >/dev/null 2>&1 && break
  sleep 10
done
xcode-select -p >/dev/null 2>&1 || { echo "❌ Xcode CLT install timed out"; exit 1; }
echo "✅ Xcode CLT installed"
EOF
```

- [ ] **Step 2: Homebrew installer**

```bash
cat > ~/Work/Git/dotfiles/run_once_before_01-homebrew.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if command -v brew >/dev/null 2>&1; then
  echo "✅ Homebrew already installed"
  exit 0
fi
echo "📥 Installing Homebrew..."
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# Activate brew in current script's env
eval "$(/opt/homebrew/bin/brew shellenv)"
echo "✅ Homebrew installed at $(brew --prefix)"
EOF
```

- [ ] **Step 3: Brew bundle (re-runs on Brewfile change)**

```bash
cat > ~/Work/Git/dotfiles/run_onchange_before_02-brew-bundle.sh.tmpl <<'EOF'
#!/usr/bin/env bash
# Brewfile hash: {{ include "Brewfile.tmpl" | sha256sum }}
set -euo pipefail
echo "📥 Running brew bundle..."
eval "$(/opt/homebrew/bin/brew shellenv)"
brew bundle --file="$HOME/Brewfile" --no-lock
echo "✅ brew bundle complete"
EOF
```

- [ ] **Step 4: Fonts cache reload**

```bash
cat > ~/Work/Git/dotfiles/run_onchange_after_03-fonts.sh.tmpl <<'EOF'
#!/usr/bin/env bash
# Fonts list hash: {{ list .brew.casks | toString | sha256sum }}
set -euo pipefail
echo "🔤 Reloading font cache..."
atsutil databases -remove 2>/dev/null || true
echo "✅ font cache reloaded"
EOF
```

- [ ] **Step 5: Shell setup**

```bash
cat > ~/Work/Git/dotfiles/run_once_after_05-shell-setup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Set zsh as default shell if not already
CURRENT_SHELL=$(dscl . -read /Users/$USER UserShell | awk '{print $2}')
if [ "$CURRENT_SHELL" != "/opt/homebrew/bin/zsh" ]; then
  echo "🐚 Setting default shell to /opt/homebrew/bin/zsh"
  if ! grep -q "^/opt/homebrew/bin/zsh$" /etc/shells; then
    echo "/opt/homebrew/bin/zsh" | sudo tee -a /etc/shells
  fi
  chsh -s /opt/homebrew/bin/zsh
fi

# Install Oh My Zsh if missing (its install script handles "already installed")
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  echo "📥 Installing Oh My Zsh..."
  RUNZSH=no KEEP_ZSHRC=yes sh -c \
    "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

# Install OMZ plugins our .zshrc references
ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
[ -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ] || \
  git clone https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
[ -d "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" ] || \
  git clone https://github.com/zsh-users/zsh-syntax-highlighting.git "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting"

echo "✅ shell setup complete"
EOF
```

- [ ] **Step 6: Claude plugins / gh extensions**

```bash
cat > ~/Work/Git/dotfiles/run_once_after_06-claude-plugins.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Pre-register Claude marketplaces for headless install (the cask reads its own state)
# This is mostly a placeholder; the actual marketplaces are referenced from
# ~/.claude/settings.json which is already in place by this point.

# gh CLI extensions (idempotent — gh handles "already installed" with non-zero exit, so swallow)
if command -v gh >/dev/null 2>&1; then
  : # add `gh extension install <ext>` lines here as needed; none today
fi

echo "✅ claude plugins / gh extensions phase complete"
EOF
```

- [ ] **Step 7: AGENTS.md sync**

```bash
cat > ~/Work/Git/dotfiles/run_onchange_after_07-agents-md-sync.sh.tmpl <<'EOF'
#!/usr/bin/env bash
# AGENTS.md hash: {{ include "dot_ai/AGENTS.md" | sha256sum }}
# claude-extras hash: {{ include "dot_ai/claude-extras.md" | sha256sum }}
# codex-extras hash: {{ include "dot_ai/codex-extras.md" | sha256sum }}
set -euo pipefail
"$HOME/.ai/render.sh"
EOF
```

- [ ] **Step 8: Make all scripts executable**

```bash
chmod +x ~/Work/Git/dotfiles/run_once_before_*.sh \
         ~/Work/Git/dotfiles/run_once_after_*.sh \
         ~/Work/Git/dotfiles/run_onchange_*.sh.tmpl
```

- [ ] **Step 9: Render templates to verify they're valid**

```bash
chezmoi execute-template --file ~/Work/Git/dotfiles/run_onchange_before_02-brew-bundle.sh.tmpl | head -3
chezmoi execute-template --file ~/Work/Git/dotfiles/run_onchange_after_03-fonts.sh.tmpl | head -3
chezmoi execute-template --file ~/Work/Git/dotfiles/run_onchange_after_07-agents-md-sync.sh.tmpl | head -3
```
Expected: each renders without error. Brewfile hash + AGENTS.md hash visible in the rendered comment.

- [ ] **Step 10: Apply (these scripts will execute on next chezmoi apply, but `--dry-run` first)**

```bash
chezmoi apply --dry-run -v 2>&1 | grep -E '(run_once|run_onchange)' | head
```
Expected: chezmoi reports it would run each script. Don't actually `apply` yet — we'll do controlled applies in later phases.

- [ ] **Step 11: Commit**

```bash
cd ~/Work/Git/dotfiles
git add run_once_before_*.sh run_once_after_*.sh run_onchange_*.sh.tmpl
git commit -m "feat(scripts): add bootstrap scripts (Xcode CLT, Homebrew, brew bundle, fonts, shell, claude, AGENTS.md sync)"
```

---

### Task 18: Write `bootstrap.sh` local entry point

**Files:**
- Create: `~/Work/Git/dotfiles/bootstrap.sh`

This is rarely the way bootstrap happens (the curl-pipe-sh one-liner is). It's here for users who clone the repo first.

- [ ] **Step 1: Write bootstrap.sh**

```bash
cat > ~/Work/Git/dotfiles/bootstrap.sh <<'EOF'
#!/usr/bin/env bash
# Local entry point. Most setups should use the curl-pipe-sh one-liner from README.
# This script is for: "I cloned the repo, now what?"
set -euo pipefail

if [ -d "$HOME/.local/share/chezmoi/.git" ]; then
  echo "❌ chezmoi source already exists at ~/.local/share/chezmoi"
  echo "   This script refuses to clobber an existing install."
  echo "   Use 'chezmoi update' or 'chezmoi git -- pull' instead."
  exit 1
fi

if ! command -v chezmoi >/dev/null 2>&1; then
  echo "📥 Installing chezmoi..."
  sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
fi

# Use the script's own directory as the source
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chezmoi init --source "$SCRIPT_DIR" --apply
EOF
chmod +x ~/Work/Git/dotfiles/bootstrap.sh
```

- [ ] **Step 2: Commit**

```bash
cd ~/Work/Git/dotfiles
git add bootstrap.sh
git commit -m "feat(bootstrap): add local bootstrap.sh entry point"
```

---

## Phase 5 — Improve Zed config (replaces tracked-as-is version)

### Task 19: Replace Zed `settings.json` with the improved version

**Files:**
- Modify: `~/Work/Git/dotfiles/private_dot_config/zed/settings.json`

The full target content is in spec section 7.4. Reproducing here for the implementation.

- [ ] **Step 1: Overwrite settings.json with the improved version**

```bash
cat > ~/Work/Git/dotfiles/private_dot_config/zed/settings.json <<'EOF'
{
  "cli_default_open_behavior": "existing_window",
  "project_panel": { "dock": "left", "git_status": true, "indent_size": 16 },
  "outline_panel": { "dock": "left" },
  "collaboration_panel": { "dock": "left" },
  "git_panel": { "dock": "left", "sort_by_path": false },
  "agent": {
    "dock": "right",
    "default_view": "thread",
    "always_allow_tool_actions": false
  },

  "base_keymap": "VSCode",

  "features": { "edit_prediction_provider": "none" },
  "show_edit_predictions": false,
  "disable_ai": false,

  "telemetry": { "diagnostics": false, "metrics": false },

  "buffer_font_family": "Monaspace Neon",
  "buffer_font_size": 14,
  "buffer_font_features": {
    "calt": true, "liga": true,
    "ss01": true, "ss02": true, "ss03": true, "ss04": true, "ss05": true
  },
  "buffer_line_height": { "custom": 1.3 },
  "ui_font_family": "Inter",
  "ui_font_size": 14,

  "theme": "Monokai Pro (CE)",
  "indent_guides": {
    "enabled": true,
    "line_width": 1,
    "active_line_width": 2,
    "coloring": "indent_aware",
    "background_coloring": "disabled"
  },
  "scrollbar": {
    "show": "auto",
    "git_diff": true,
    "diagnostics": "all",
    "search_results": true,
    "selected_text": true,
    "selected_symbol": true,
    "cursors": true
  },
  "minimap": { "show": "auto" },
  "show_whitespaces": "selection",
  "wrap_guides": [80, 120],
  "show_wrap_guides": true,
  "centered_layout": { "left_padding": 0.15, "right_padding": 0.15 },
  "tab_bar": { "show_nav_history_buttons": false, "show_tab_bar_buttons": true },
  "tabs": {
    "git_status": true,
    "show_close_button": "hover",
    "file_icons": true,
    "activate_on_close": "history"
  },
  "toolbar": {
    "breadcrumbs": true,
    "quick_actions": true,
    "selections_menu": true,
    "agent_review": false,
    "code_actions": true
  },
  "file_finder": { "modal_max_width": "medium", "git_status": true },

  "tab_size": 2,
  "hard_tabs": false,
  "soft_wrap": "editor_width",
  "preferred_line_length": 100,
  "show_completions_on_input": true,
  "snippet_sort_order": "top",
  "use_autoclose": true,
  "auto_signature_help": true,
  "show_signature_help_after_edits": true,
  "auto_save": "on_focus_change",
  "format_on_save": "on",
  "remove_trailing_whitespace_on_save": true,
  "ensure_final_newline_on_save": true,
  "confirm_quit": true,
  "restore_on_startup": "last_workspace",
  "use_smartcase_search": true,
  "cursor_blink": true,
  "scroll_beyond_last_line": "vertical_scroll_margin",
  "vertical_scroll_margin": 4,

  "inlay_hints": {
    "enabled": true,
    "show_type_hints": true,
    "show_parameter_hints": true,
    "show_other_hints": true,
    "show_background": false,
    "edit_debounce_ms": 700,
    "scroll_debounce_ms": 50
  },

  "diagnostics": {
    "include_warnings": true,
    "inline": {
      "enabled": true,
      "update_debounce_ms": 150,
      "padding": 4,
      "min_column": 0,
      "max_severity": "warning"
    }
  },

  "formatter": {
    "external": {
      "command": "prettier",
      "arguments": ["--stdin-filepath", "{buffer_path}"]
    }
  },

  "terminal": {
    "font_family": "Monaspace Neon",
    "font_size": 14,
    "font_features": { "calt": true, "liga": true },
    "shell": { "program": "/opt/homebrew/bin/zsh" },
    "working_directory": "current_project_directory",
    "copy_on_select": false
  },

  "git": {
    "inline_blame": { "enabled": true, "delay_ms": 600, "show_commit_summary": true }
  },

  "search": {
    "button": true,
    "whole_word": false,
    "case_sensitive": false,
    "include_ignored": false,
    "regex": false
  },

  "languages": {
    "JavaScript":  { "format_on_save": "off", "tab_size": 2 },
    "JSX":         { "format_on_save": "off", "tab_size": 2 },
    "TypeScript":  { "format_on_save": "off", "tab_size": 2 },
    "TSX":         { "format_on_save": "off", "tab_size": 2 },

    "Python": {
      "tab_size": 4,
      "preferred_line_length": 88,
      "language_servers": ["pyright", "ruff", "!python-lsp-server"],
      "format_on_save": "on",
      "formatter": { "language_server": { "name": "ruff" } },
      "code_actions_on_format": {
        "source.organizeImports.ruff": true,
        "source.fixAll.ruff": true
      }
    },

    "Rust": {
      "tab_size": 4,
      "format_on_save": "on",
      "formatter": "language_server",
      "language_servers": ["rust-analyzer"]
    },

    "Markdown": {
      "soft_wrap": "editor_width",
      "show_completions_on_input": false,
      "format_on_save": "on",
      "remove_trailing_whitespace_on_save": false
    },

    "YAML": { "tab_size": 2, "format_on_save": "on" },
    "TOML": { "tab_size": 2, "format_on_save": "on" },

    "JSON":  { "format_on_save": "on" },
    "JSONC": {
      "format_on_save": "on",
      "formatter": {
        "external": {
          "command": "prettier",
          "arguments": ["--stdin-filepath", "{buffer_path}"]
        }
      }
    },

    "Dart": { "format_on_save": "on", "tab_size": 2 },
    "SCSS": { "format_on_save": "on", "tab_size": 2 }
  },

  "lsp": {
    "pyright": {
      "settings": {
        "python": {
          "analysis": {
            "typeCheckingMode": "standard",
            "autoImportCompletions": true,
            "diagnosticMode": "openFilesOnly",
            "useLibraryCodeForTypes": true
          }
        }
      }
    },
    "rust-analyzer": {
      "initialization_options": {
        "check": { "command": "clippy" },
        "cargo": { "features": "all" },
        "completion": { "snippets": { "custom": {} } },
        "inlayHints": {
          "bindingModeHints": { "enable": false },
          "closureReturnTypeHints": { "enable": "never" },
          "lifetimeElisionHints": { "enable": "never" }
        }
      }
    }
  },

  "file_types": {
    "JSONC": ["zed.app/settings.json", ".vscode/*.json", "tsconfig*.json", ".eslintrc*.json"]
  }
}
EOF
```

- [ ] **Step 2: Validate JSONC parses**

```bash
node -e "console.log(Object.keys(require('jsonc-parser').parse(require('fs').readFileSync('$HOME/Work/Git/dotfiles/private_dot_config/zed/settings.json','utf8'))).length)" 2>/dev/null || \
python3 -c "import json, re; s = open('$HOME/Work/Git/dotfiles/private_dot_config/zed/settings.json').read(); s = re.sub(r'//.*$|/\*.*?\*/', '', s, flags=re.M|re.S); d = json.loads(s); print('keys:', len(d))"
```
Expected: prints a key count (e.g. `keys: 33`). If parse error, fix the JSON.

- [ ] **Step 3: Apply via chezmoi**

```bash
chezmoi diff
chezmoi apply
```
Expected: diff shows the settings.json changes; apply succeeds.

- [ ] **Step 4: Open Zed and confirm new settings work**

Open Zed, observe: theme is Monokai Pro (CE), Monaspace Neon font, indent guides visible, wrap guides at 80/120, no Copilot suggestions, inline blame with commit summary on existing repo. If anything looks broken, check Zed's diagnostics panel.

- [ ] **Step 5: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/zed/settings.json
git commit -m "feat(zed): improved settings (no AI, telemetry off, inlay hints, language configs for Py/Rust/MD/YAML/TOML)"
```

---

### Task 20: Add Zed `keymap.json` shortcuts

**Files:**
- Modify: `~/Work/Git/dotfiles/private_dot_config/zed/keymap.json`

- [ ] **Step 1: Overwrite keymap.json**

```bash
cat > ~/Work/Git/dotfiles/private_dot_config/zed/keymap.json <<'EOF'
[
  {
    "context": "Terminal",
    "bindings": { "shift-enter": ["terminal::SendText", "\r"] }
  },
  {
    "context": "Editor && mode == full",
    "bindings": {
      "cmd-k cmd-d": "editor::ToggleInlineDiagnostics"
    }
  },
  {
    "context": "Workspace",
    "bindings": {
      "cmd-k m": "editor::ToggleMinimap",
      "cmd-k p": "zed::OpenProjectSettings"
    }
  }
]
EOF
```

- [ ] **Step 2: Apply**

```bash
chezmoi apply
```

- [ ] **Step 3: Verify in Zed**

In Zed, press `Cmd+K Cmd+D` in an editor — toggles inline diagnostics. `Cmd+K M` toggles minimap. `Cmd+K P` opens project settings.

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/zed/keymap.json
git commit -m "feat(zed): add productivity keybindings (toggle diagnostics, minimap, project settings)"
```

---

## Phase 6 — 1Password setup & secrets migration

### Task 21: Enable 1Password CLI integration in the desktop app

**Files:**
- None (manual GUI step)

- [ ] **Step 1: Open 1Password settings**

Open the 1Password macOS app → Settings (`Cmd+,`) → Developer.

- [ ] **Step 2: Enable CLI integration + Touch ID**

Tick:
- ✅ "Integrate with 1Password CLI"
- ✅ "Use Touch ID to unlock 1Password"
- ✅ "Use Touch ID to authorize the CLI"

- [ ] **Step 3: Verify integration is live**

Run:
```bash
op vault list
```
Expected: prints a table of vaults including "Private". If prompted by Touch ID, authorize. If "command not found" or "session expired", re-check the Settings → Developer panel.

No commit (system change).

---

### Task 22: Catalogue current secrets and create 1Password items

**Files:**
- None (1Password vault changes, manual)

- [ ] **Step 1: Dump current Keychain secrets to a temp note (NEVER commit)**

```bash
echo "=== Current Keychain secrets (move these to 1Password) ===" > /tmp/secrets-to-migrate.txt
for KEY in TURBO_TOKEN TURBO_TEAM TURBO_REMOTE_CACHE_SIGNATURE_KEY TAVILY_API_KEY CLOUDFLARE_API_TOKEN STRIPE_SECRET_KEY; do
  VALUE=$(security find-generic-password -s "zsh-secrets" -a "$KEY" -w 2>/dev/null || echo "NOT_FOUND")
  echo "$KEY = $VALUE" >> /tmp/secrets-to-migrate.txt
done
echo "Wrote /tmp/secrets-to-migrate.txt — open in Zed but DO NOT COMMIT"
```

- [ ] **Step 2: Open the temp file and create 1Password items manually**

For each non-`NOT_FOUND` line in `/tmp/secrets-to-migrate.txt`, create a 1Password item:

| Variable | 1Password Item Title | Vault | Field |
|---|---|---|---|
| TAVILY_API_KEY | `tavily-api` | Private | credential (or password) |
| CLOUDFLARE_API_TOKEN | `cloudflare-api` | Private | credential |
| STRIPE_SECRET_KEY | `stripe-secret` | Private | credential |
| TURBO_TOKEN | `turbo` | Private | token (custom field) |
| TURBO_TEAM | `turbo` (same item) | Private | team (custom field) |
| TURBO_REMOTE_CACHE_SIGNATURE_KEY | `turbo` (same item) | Private | signature_key (custom field) |

Use the 1Password GUI: New Item → API Credential → fill in the fields. For the `turbo` item, use a generic Login or Note with three custom fields.

- [ ] **Step 3: Verify each item resolves via op**

```bash
op read "op://Private/tavily-api/credential" --no-newline >/dev/null && echo "✅ tavily-api"
op read "op://Private/cloudflare-api/credential" --no-newline >/dev/null && echo "✅ cloudflare-api"
op read "op://Private/stripe-secret/credential" --no-newline >/dev/null && echo "✅ stripe-secret"
op read "op://Private/turbo/token" --no-newline >/dev/null && echo "✅ turbo/token"
op read "op://Private/turbo/team" --no-newline >/dev/null && echo "✅ turbo/team"
op read "op://Private/turbo/signature_key" --no-newline >/dev/null && echo "✅ turbo/signature_key"
```
Expected: 6 ✅ lines. If any error, fix the item in 1Password (field name, vault, or item title) before continuing.

- [ ] **Step 4: Verify the existing Moonshot item is also accessible**

```bash
op read "op://Private/Moonshot AI/credential" --no-newline >/dev/null && echo "✅ Moonshot (existing)"
```

- [ ] **Step 5: Securely delete the temp file**

```bash
rm -P /tmp/secrets-to-migrate.txt
```

No commit (vault changes only).

---

### Task 23: Create the `op` env template

**Files:**
- Create: `~/Work/Git/dotfiles/private_dot_config/op/env.tmpl`

This file contains only `op://` URIs — safe to commit publicly (URIs are references, not secrets).

- [ ] **Step 1: Write env.tmpl**

```bash
mkdir -p ~/Work/Git/dotfiles/private_dot_config/op
cat > ~/Work/Git/dotfiles/private_dot_config/op/env.tmpl <<'EOF'
# Resolved by `op inject` at shell startup. Contains only references, never secrets.
export TAVILY_API_KEY="op://Private/tavily-api/credential"
export CLOUDFLARE_API_TOKEN="op://Private/cloudflare-api/credential"
export STRIPE_SECRET_KEY="op://Private/stripe-secret/credential"
export TURBO_TOKEN="op://Private/turbo/token"
export TURBO_TEAM="op://Private/turbo/team"
export TURBO_REMOTE_CACHE_SIGNATURE_KEY="op://Private/turbo/signature_key"
export MOONSHOT_API_KEY="op://Private/Moonshot AI/credential"
EOF
```

- [ ] **Step 2: Apply via chezmoi**

```bash
chezmoi apply
ls -la ~/.config/op/env.tmpl
```
Expected: file exists, mode `-rw-------` (private_ prefix gives 0600).

- [ ] **Step 3: Verify op inject resolves all URIs**

```bash
op inject -i ~/.config/op/env.tmpl 2>&1 | head -20
```
Expected: prints the resolved exports with actual secret values (Touch ID prompt may appear once). NEVER paste this output anywhere.

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/op
git commit -m "feat(op): add 1Password env template (op:// URIs only, never secrets)"
```

---

### Task 24: Switch `.zshrc` from Keychain `_ks` to inline `op inject`

**Files:**
- Modify: `~/Work/Git/dotfiles/dot_zshrc`
- Modify: `~/Work/Git/dotfiles/dot_zshenv`
- Modify: `~/Work/Git/dotfiles/dot_zprofile`

- [ ] **Step 1: Edit dot_zshrc — remove Keychain block, add op inject**

Open `~/Work/Git/dotfiles/dot_zshrc`. Find this block:

```bash
# Secrets from macOS Keychain
_ks() { security find-generic-password -s "zsh-secrets" -a "$1" -w 2>/dev/null; }
export TURBO_TOKEN=$(_ks TURBO_TOKEN)
export TURBO_TEAM=$(_ks TURBO_TEAM)
export TURBO_REMOTE_CACHE_SIGNATURE_KEY=$(_ks TURBO_REMOTE_CACHE_SIGNATURE_KEY)
```

Replace it with:

```bash
# Secrets via 1Password CLI — single inject covers all secrets, ~300ms with biometric unlock
if command -v op >/dev/null 2>&1 && [ -r "$HOME/.config/op/env.tmpl" ]; then
  eval "$(op inject -i "$HOME/.config/op/env.tmpl" 2>/dev/null)" || \
    echo "⚠ 1Password not loaded — unlock the app or run \`op signin\`"
fi
```

Also remove the `refresh-moonshot` alias (no longer needed; secrets resolve automatically).

- [ ] **Step 2: Edit dot_zshenv — remove Moonshot cached-file block**

Open `~/Work/Git/dotfiles/dot_zshenv`. Remove:

```bash
# Moonshot AI key for graphify (Kimi K2.6 backend) — read from local cache.
# Refresh the cache from 1Password (one Touch ID prompt) by running:
#   refresh-moonshot
# (alias defined in .zshrc)
if [ -z "$MOONSHOT_API_KEY" ] && [ -r "$HOME/.cache/moonshot-key" ]; then
    export MOONSHOT_API_KEY="$(cat "$HOME/.cache/moonshot-key")"
fi
```

Leave the PATH brew block intact.

- [ ] **Step 3: Edit dot_zprofile — remove Keychain block, add op inject (for GUI-launched MCP servers)**

Open `~/Work/Git/dotfiles/dot_zprofile`. Find:

```bash
# MCP secrets — VS Code reads env at launch, must be set here (login shell)
_ks() { security find-generic-password -s "zsh-secrets" -a "$1" -w 2>/dev/null; }
export TAVILY_API_KEY=$(_ks TAVILY_API_KEY)
# Add your Cloudflare and Stripe tokens to Keychain then uncomment:
# security add-generic-password -s "zsh-secrets" -a "CLOUDFLARE_API_TOKEN" -w "<token>"
# security add-generic-password -s "zsh-secrets" -a "STRIPE_SECRET_KEY" -w "<key>"
export CLOUDFLARE_API_TOKEN=$(_ks CLOUDFLARE_API_TOKEN)
export STRIPE_SECRET_KEY=$(_ks STRIPE_SECRET_KEY)
```

Replace with:

```bash
# MCP secrets via 1Password (login shell, so GUI launchers see env vars)
if command -v op >/dev/null 2>&1 && [ -r "$HOME/.config/op/env.tmpl" ]; then
  eval "$(op inject -i "$HOME/.config/op/env.tmpl" 2>/dev/null)" || true
fi
```

- [ ] **Step 4: Apply via chezmoi**

```bash
chezmoi diff
chezmoi apply
```
Expected: diff shows the three shell files changing; apply succeeds.

- [ ] **Step 5: Verify in a new shell**

```bash
zsh -i -c 'echo "TAVILY=$TAVILY_API_KEY" | head -c 30'
zsh -i -c 'echo "CLOUDFLARE=$CLOUDFLARE_API_TOKEN" | head -c 35'
zsh -i -c 'echo "TURBO=$TURBO_TOKEN" | head -c 30'
zsh -i -c 'echo "MOONSHOT=$MOONSHOT_API_KEY" | head -c 30'
```
Expected: each prints `<NAME>=<first chars of secret>...`. If any prints `<NAME>=` (empty), op inject failed — check `op vault list` and re-verify the URI in env.tmpl.

- [ ] **Step 6: Commit**

```bash
cd ~/Work/Git/dotfiles
git add dot_zshrc dot_zshenv dot_zprofile
git commit -m "feat(secrets): replace Keychain _ks with inline op inject in .zshrc/.zprofile"
```

---

### Task 25: Delete Keychain entries (cleanup)

**Files:**
- None (Keychain change)

- [ ] **Step 1: Confirm new shells work for at least 24h before this task — or accept the risk**

This task is deletion. Skipping for a day lets you catch any missed Keychain dependencies. If you're confident, proceed.

- [ ] **Step 2: Delete the entries**

```bash
for KEY in TURBO_TOKEN TURBO_TEAM TURBO_REMOTE_CACHE_SIGNATURE_KEY TAVILY_API_KEY CLOUDFLARE_API_TOKEN STRIPE_SECRET_KEY; do
  security delete-generic-password -s "zsh-secrets" -a "$KEY" 2>/dev/null && echo "✅ deleted $KEY" || echo "⚠ $KEY not found (already gone)"
done
```
Expected: 6 ✅ deleted lines (or warnings if any were not present).

- [ ] **Step 3: Confirm new shells still load secrets**

```bash
zsh -i -c 'echo "TAVILY=$TAVILY_API_KEY" | head -c 30'
```
Expected: still prints the secret (now resolved via op, no Keychain dependency).

- [ ] **Step 4: Delete the Moonshot cached file (no longer used)**

```bash
rm -f ~/.cache/moonshot-key
zsh -i -c 'echo "MOONSHOT=$MOONSHOT_API_KEY" | head -c 30'
```
Expected: still prints (resolved via op).

No commit (system change).

---

## Phase 7 — Toolchain migration (Volta + pyenv → mise)

### Task 26: Install mise globals and verify shims

**Files:**
- Create: `~/Work/Git/dotfiles/private_dot_config/mise/config.toml`

mise is already installed (Task 13). This task configures globals and verifies shims work.

- [ ] **Step 1: Write the global mise config**

```bash
mkdir -p ~/Work/Git/dotfiles/private_dot_config/mise
cat > ~/Work/Git/dotfiles/private_dot_config/mise/config.toml <<'EOF'
[tools]
node   = "lts"
python = "3.13"

[settings]
experimental         = true
legacy_version_file  = true
EOF
```

- [ ] **Step 2: Apply via chezmoi**

```bash
chezmoi apply
ls ~/.config/mise/config.toml
```
Expected: file exists.

- [ ] **Step 3: Install the listed tools**

```bash
mise install
mise list
```
Expected: `node@lts` and `python@3.13` show as installed (this can take 5–15 minutes for the first install — Python compiles from source).

- [ ] **Step 4: Verify shim path before activation**

```bash
ls ~/.local/share/mise/shims/
```
Expected: shows `node`, `npm`, `python`, `pip`, etc.

- [ ] **Step 5: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/mise
git commit -m "feat(mise): add global config (node lts, python 3.13)"
```

---

### Task 27: Add mise activation to shell init

**Files:**
- Modify: `~/Work/Git/dotfiles/dot_zshrc`
- Modify: `~/Work/Git/dotfiles/dot_zprofile`

- [ ] **Step 1: Add mise activation to dot_zshrc**

Add this BEFORE the Volta/pyenv blocks (which we'll remove next):

```bash
# mise — version manager (replaces Volta + pyenv)
eval "$(mise activate zsh)"
```

- [ ] **Step 2: Add mise shims activation to dot_zprofile**

Add near the top, after brew shellenv:

```bash
# mise shims for GUI-launched processes (Zed MCP servers etc.)
eval "$(mise activate zsh --shims)"
```

- [ ] **Step 3: Apply**

```bash
chezmoi apply
```

- [ ] **Step 4: Verify in a new shell that mise is active alongside Volta (both still present)**

```bash
zsh -i -c 'mise current; echo "node-->"; which node; echo "python-->"; which python'
```
Expected: `mise current` shows node lts and python 3.13.x. `which node` may still show Volta (Volta wins because it's PATHed first); that's fine for now — we'll remove Volta in Task 28.

- [ ] **Step 5: Commit**

```bash
cd ~/Work/Git/dotfiles
git add dot_zshrc dot_zprofile
git commit -m "feat(mise): activate mise in shell init (Volta still present, removed in next task)"
```

---

### Task 28: Migrate Node tooling and remove Volta

**Files:**
- Modify: `~/Work/Git/dotfiles/dot_zshrc`

- [ ] **Step 1: List Volta-managed globals (excluding Volta's own binaries)**

```bash
ls ~/.volta/bin | grep -v -E '^(volta|volta-shim|volta-migrate)$'
```
Expected: list like `node`, `npm`, `npx`, `pnpm`, `pnpx`, `yarn`, `pyright`, `pyright-langserver`, `sanity`, `tsc`, `tsserver`, `typescript-language-server`.

- [ ] **Step 2: Install replacements via mise (where appropriate) or skip (Zed/per-project)**

Tooling decisions:
- `node`, `npm`, `npx`, `pnpm`, `pnpx`, `yarn` → mise (already done via `node@lts` + add `pnpm@latest yarn@latest`)
- `pyright`, `pyright-langserver`, `typescript-language-server`, `tsc`, `tsserver` → SKIP. Zed installs LSPs automatically. Claude Code plugins ship their own.
- `sanity` → reinstall via `npm install -g @sanity/cli` if you actively use it; otherwise skip.

```bash
mise use --global pnpm@latest
mise install
```

- [ ] **Step 3: Edit dot_zshrc — remove Volta block**

Remove these lines:

```bash
# PATH — Volta (Node version manager)
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"
```

- [ ] **Step 4: Apply and verify Volta no longer wins**

```bash
chezmoi apply
zsh -i -c 'which node; which npm; which pnpm; which yarn 2>/dev/null'
```
Expected: each command resolves to `~/.local/share/mise/shims/<name>`. Volta paths gone.

- [ ] **Step 5: Test a real project**

Pick a project in `~/Work/Git/` with a `package.json` (e.g., `~/Work/Git/jasonmatthew.dev`):

```bash
cd ~/Work/Git/jasonmatthew.dev
node --version
pnpm --version
pnpm install --frozen-lockfile 2>&1 | tail -5
```
Expected: install runs to completion (or fails on something unrelated to node version).

- [ ] **Step 6: Delete Volta data**

```bash
rm -rf ~/.volta
which volta || echo "✅ volta removed"
```
Expected: `✅ volta removed`.

- [ ] **Step 7: Commit**

```bash
cd ~/Work/Git/dotfiles
git add dot_zshrc
git commit -m "feat(mise): migrate Node tooling from Volta to mise; remove Volta init from .zshrc"
```

---

### Task 29: Migrate Python tooling and remove pyenv

**Files:**
- Modify: `~/Work/Git/dotfiles/dot_zshrc`
- Modify: `~/Work/Git/dotfiles/dot_zprofile`

- [ ] **Step 1: Confirm Python migration is safe**

```bash
mise current python
which python
zsh -i -c 'which python; python --version'
```
Expected: mise reports python 3.13.x; pyenv may still win in `which`. We're about to flip the order.

- [ ] **Step 2: Edit dot_zprofile — remove pyenv block, update CLOUDSDK_PYTHON**

Find:

```bash
# pyenv (must be in .zprofile so login shells / brew cask installers see it)
export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

# Google Cloud SDK — use pyenv-managed Python
export CLOUDSDK_PYTHON="$PYENV_ROOT/shims/python3"
```

Replace with:

```bash
# Google Cloud SDK — use mise-managed Python
export CLOUDSDK_PYTHON="$(mise which python 2>/dev/null || echo /usr/bin/python3)"
```

- [ ] **Step 3: Edit dot_zshrc — remove pyenv block**

Find and remove:

```bash
# PATH — pyenv (Python version manager)
export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
```

- [ ] **Step 4: Apply**

```bash
chezmoi apply
```

- [ ] **Step 5: Verify in a new shell**

```bash
zsh -i -c 'which python; python --version; echo "CLOUDSDK_PYTHON=$CLOUDSDK_PYTHON"; gcloud --version 2>&1 | head -3'
```
Expected: `which python` resolves to mise shim; `python --version` is 3.13.x; `CLOUDSDK_PYTHON` is the mise shim path; `gcloud --version` runs cleanly.

- [ ] **Step 6: Test a real Python project (pick one or skip if none)**

If you have any Python projects in `~/Work/Git/`, cd in and run `python -c 'import sys; print(sys.version)'` — confirm 3.13.x.

- [ ] **Step 7: Uninstall pyenv and remove data**

```bash
brew uninstall pyenv
rm -rf ~/.pyenv
which pyenv 2>/dev/null && echo "❌ pyenv still in PATH" || echo "✅ pyenv removed"
```
Expected: `✅ pyenv removed`.

- [ ] **Step 8: Remove pyenv from `.chezmoidata/packages.yaml`**

Edit `~/Work/Git/dotfiles/.chezmoidata/packages.yaml` — remove the `- pyenv` line under `formulae`.

- [ ] **Step 9: Verify Brewfile re-renders without pyenv**

```bash
chezmoi execute-template --file ~/Work/Git/dotfiles/Brewfile.tmpl | grep -c '^brew "pyenv"' | grep -q '^0$' && echo "✅ pyenv removed from Brewfile" || echo "❌ still in Brewfile"
```
Expected: `✅ pyenv removed from Brewfile`.

- [ ] **Step 10: Commit**

```bash
cd ~/Work/Git/dotfiles
git add dot_zshrc dot_zprofile .chezmoidata/packages.yaml
git commit -m "feat(mise): migrate Python from pyenv to mise; update CLOUDSDK_PYTHON; remove pyenv from packages.yaml"
```

---

## Phase 8 — Prompt swap (p10k → Starship)

### Task 30: Replace Powerlevel10k with Starship in shell init

**Files:**
- Modify: `~/Work/Git/dotfiles/dot_zshrc`
- Move: `~/Work/Git/dotfiles/dot_p10k.zsh` → `~/Work/Git/dotfiles/archive/dot_p10k.zsh`

- [ ] **Step 1: Archive p10k.zsh in the repo**

```bash
mkdir -p ~/Work/Git/dotfiles/archive
git -C ~/Work/Git/dotfiles mv dot_p10k.zsh archive/dot_p10k.zsh
```
This stops chezmoi from managing `~/.p10k.zsh` — but the file ALREADY exists at `~/.p10k.zsh`, so chezmoi will leave it. If you want to remove it later: `rm ~/.p10k.zsh`. We won't do that in this task — keep the seed-machine file as a fallback.

- [ ] **Step 2: Edit dot_zshrc — remove p10k blocks, add starship init**

Find and remove the FIRST block (top of file):

```bash
# Enable Powerlevel10k instant prompt. Must stay at the top.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi
```

Find and replace the Oh My Zsh block:

```bash
ZSH_THEME="powerlevel10k/powerlevel10k"
```

Replace with:

```bash
ZSH_THEME=""
```

Find and remove the bottom block:

```bash
# Powerlevel10k config
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
```

Add at the very bottom (after Oh My Zsh sourcing, before terminal-specific lines):

```bash
# Starship prompt
eval "$(starship init zsh)"
```

- [ ] **Step 3: Apply**

```bash
chezmoi apply
```

- [ ] **Step 4: Open a new shell and verify**

In a NEW WezTerm tab/window: confirm prompt is Starship (single-line with directory, git branch, character `❯`). No p10k chrome.

- [ ] **Step 5: Remove p10k OMZ theme dependency from Brewfile if present**

(Powerlevel10k is sourced via OMZ custom — installed by run_once_after_05-shell-setup.sh, not via brew. Skip if it isn't in packages.yaml.)

- [ ] **Step 6: Commit**

```bash
cd ~/Work/Git/dotfiles
git add dot_zshrc archive/dot_p10k.zsh
git commit -m "feat(starship): replace Powerlevel10k with Starship; archive p10k.zsh as fallback"
```

---

## Phase 9 — macOS defaults

### Task 31: Write the `run_once_after_04-macos-defaults.sh` script

**Files:**
- Create: `~/Work/Git/dotfiles/run_once_after_04-macos-defaults.sh`

- [ ] **Step 1: Write the script**

```bash
cat > ~/Work/Git/dotfiles/run_once_after_04-macos-defaults.sh <<'EOF'
#!/usr/bin/env bash
# macOS system defaults. Idempotent — safe to re-run.
# Discover new defaults via: brew install plistwatch && plistwatch
set -euo pipefail

echo "🛠  Applying macOS defaults..."

# --- Dock ---
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-time-modifier -float 0.5
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock tilesize -int 48
defaults write com.apple.dock minimize-to-application -bool true

# --- Finder ---
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"  # list view
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true
defaults write com.apple.finder QuitMenuItem -bool true

# --- Keyboard ---
defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false   # use key-repeat
defaults write NSGlobalDomain KeyRepeat -int 2
defaults write NSGlobalDomain InitialKeyRepeat -int 15

# --- Trackpad ---
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1

# --- Screenshots ---
mkdir -p "$HOME/Pictures/Screenshots"
defaults write com.apple.screencapture location -string "$HOME/Pictures/Screenshots"
defaults write com.apple.screencapture disable-shadow -bool true
defaults write com.apple.screencapture type -string "png"

# --- Global ---
defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticPeriodSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

# --- Activity Monitor ---
defaults write com.apple.ActivityMonitor IconType -int 5  # CPU usage
defaults write com.apple.ActivityMonitor ShowCategory -int 0  # all processes

# --- Safari ---
defaults write com.apple.Safari IncludeDevelopMenu -bool true
defaults write com.apple.Safari ShowFullURLInSmartSearchField -bool true
defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true

# Apply changes by killing affected daemons (no logout required)
killall Dock Finder SystemUIServer cfprefsd 2>/dev/null || true

echo "✅ macOS defaults applied. Some settings may require logout to fully take effect."
EOF
chmod +x ~/Work/Git/dotfiles/run_once_after_04-macos-defaults.sh
```

- [ ] **Step 2: Inspect (dry-run via cat) before running**

```bash
cat ~/Work/Git/dotfiles/run_once_after_04-macos-defaults.sh
```
Read through. If any default looks wrong for your taste (e.g., you want recents in Dock), edit before running.

- [ ] **Step 3: Run via chezmoi apply**

```bash
chezmoi apply
```
Expected: chezmoi runs the script. Dock auto-hides, Finder shows extensions, screenshots go to ~/Pictures/Screenshots, etc.

- [ ] **Step 4: Spot-check the changes**

Try:
- Drag Dock cursor to bottom of screen — Dock auto-hides ✓
- Open Finder — pathbar visible at bottom, list view ✓
- Take a screenshot (Cmd+Shift+3) — saves to ~/Pictures/Screenshots ✓

- [ ] **Step 5: Commit**

```bash
cd ~/Work/Git/dotfiles
git add run_once_after_04-macos-defaults.sh
git commit -m "feat(macos): add defaults script (Dock, Finder, keyboard, screenshots, etc.)"
```

---

## Phase 10 — AGENTS.md migration

### Task 32: Switch `~/.claude/CLAUDE.md` to be rendered from AGENTS.md

**Files:**
- Modify: `~/Work/Git/dotfiles/private_dot_claude/CLAUDE.md` → REMOVE (rendered file, not source)

- [ ] **Step 1: Verify the rendered output matches the current file**

```bash
~/.ai/render.sh
diff ~/Work/Git/dotfiles/private_dot_claude/CLAUDE.md ~/.claude/CLAUDE.md
```
Expected: empty diff. If different, the AGENTS.md split missed something — fix `dot_ai/AGENTS.md` or `dot_ai/claude-extras.md` until the diff is empty.

- [ ] **Step 2: Stop tracking CLAUDE.md as a chezmoi-managed file (it's now rendered)**

```bash
git -C ~/Work/Git/dotfiles rm private_dot_claude/CLAUDE.md
```

- [ ] **Step 3: Update `.chezmoiignore` to ignore the rendered CLAUDE.md**

This prevents chezmoi from erroring on a managed file that no longer exists in source. Open `.chezmoiignore` and update the `~/.claude/` allowlist:

Change:
```
!.claude/CLAUDE.md
```

To:
```
# CLAUDE.md is rendered by run_onchange_after_07-agents-md-sync.sh.tmpl, not tracked
.claude/CLAUDE.md
```

- [ ] **Step 4: Apply and verify**

```bash
chezmoi apply
~/.ai/render.sh
diff /tmp/CLAUDE.md.before ~/.claude/CLAUDE.md 2>/dev/null || cat ~/.claude/CLAUDE.md | head
```
Expected: `~/.claude/CLAUDE.md` exists and contains the rendered content (AGENTS.md + claude-extras.md).

- [ ] **Step 5: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_claude/CLAUDE.md .chezmoiignore
git commit -m "feat(ai): migrate CLAUDE.md to rendered output of AGENTS.md (no longer chezmoi-tracked)"
```

---

## Phase 11 — Secret scanning (gitleaks)

### Task 33: Configure gitleaks with op:// allowlist

**Files:**
- Create: `~/Work/Git/dotfiles/private_dot_config/gitleaks/gitleaks.toml`

- [ ] **Step 1: Write the gitleaks config**

```bash
mkdir -p ~/Work/Git/dotfiles/private_dot_config/gitleaks
cat > ~/Work/Git/dotfiles/private_dot_config/gitleaks/gitleaks.toml <<'EOF'
title = "Personal gitleaks config"

[extend]
useDefault = true

[allowlist]
description = "1Password URIs and known false positives"
regexes = [
  '''op://[A-Za-z0-9 _/-]+''',
]
paths = [
  '''docs/specs/.*\.md''',
  '''.*\.example''',
]
EOF
```

- [ ] **Step 2: Apply**

```bash
chezmoi apply
ls ~/.config/gitleaks/gitleaks.toml
```
Expected: file exists, mode 0600.

- [ ] **Step 3: Verify gitleaks reads the config**

```bash
gitleaks detect --no-git --config ~/.config/gitleaks/gitleaks.toml --source ~/Work/Git/dotfiles 2>&1 | tail -10
```
Expected: completes. May show 0 leaks or a small number for spec markdown — those should be allowlisted by paths.

- [ ] **Step 4: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/gitleaks
git commit -m "feat(gitleaks): add config with op:// URI allowlist"
```

---

### Task 34: Install pre-commit hook

**Files:**
- Create: `~/Work/Git/dotfiles/private_dot_config/git/hooks/executable_pre-commit`
- Modify: `~/Work/Git/dotfiles/dot_gitconfig`

- [ ] **Step 1: Write the pre-commit hook**

```bash
mkdir -p ~/Work/Git/dotfiles/private_dot_config/git/hooks
cat > ~/Work/Git/dotfiles/private_dot_config/git/hooks/executable_pre-commit <<'EOF'
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
EOF
```

- [ ] **Step 2: Add `core.hooksPath` to dot_gitconfig**

Open `~/Work/Git/dotfiles/dot_gitconfig` and add to the `[core]` section (or create it):

```
	hooksPath = ~/.config/git/hooks
```

So `[core]` reads:
```ini
[core]
	editor = nvim
	excludesfile = ~/.gitignore_global
	hooksPath = ~/.config/git/hooks
```

- [ ] **Step 3: Apply**

```bash
chezmoi apply
ls ~/.config/git/hooks/pre-commit
```
Expected: `pre-commit` exists with mode `-rwx------`.

- [ ] **Step 4: Test the hook fires on a staged secret**

In a sandbox repo (NOT the dotfiles repo):

```bash
cd /tmp
mkdir gitleaks-test && cd gitleaks-test
git init
echo 'AWS_SECRET_ACCESS_KEY="AKIAIOSFODNN7EXAMPLE"' > .env
git add .env
git commit -m "test" 2>&1 | tail -10
```
Expected: commit BLOCKED with `❌ gitleaks blocked the commit — secret detected.`

Cleanup:
```bash
rm -rf /tmp/gitleaks-test
```

- [ ] **Step 5: Test the hook does NOT block legitimate commits**

In the dotfiles repo:

```bash
cd ~/Work/Git/dotfiles
echo "# test addition" >> README.md
git add README.md
git commit -m "test: pre-commit allows clean diffs" --dry-run 2>&1 | head
```
Expected: dry-run shows the commit would succeed. Reset:

```bash
git checkout README.md
```

- [ ] **Step 6: Commit**

```bash
cd ~/Work/Git/dotfiles
git add private_dot_config/git/hooks dot_gitconfig
git commit -m "feat(gitleaks): add pre-commit hook + core.hooksPath wiring"
```

---

## Phase 12 — Validation & public push

### Task 35: Final repo-wide secret scan

**Files:**
- None modified

- [ ] **Step 1: Run gitleaks against the full repo and history**

```bash
cd ~/Work/Git/dotfiles
gitleaks detect --redact --config ~/.config/gitleaks/gitleaks.toml --verbose 2>&1 | tail -30
```
Expected: `0 leaks found` OR allowlisted findings only. If real leaks found, address them (rewrite history if necessary; the commit hash is now poisoned).

- [ ] **Step 2: Spot-check for op:// URIs (these should be present and not flagged)**

```bash
grep -r 'op://' ~/Work/Git/dotfiles --include='*.tmpl' --include='*.toml' | head
```
Expected: shows `op://Private/...` lines in `private_dot_config/op/env.tmpl`. These are references and not secrets.

- [ ] **Step 3: Spot-check that NO actual secrets are present**

```bash
grep -rE '(ghp_|gho_|sk-[a-zA-Z0-9]{20,}|sk_live_|AKIA[0-9A-Z]{16}|xox[baprs]-)' ~/Work/Git/dotfiles 2>/dev/null
```
Expected: no output. Any output = real secret accidentally committed; do NOT push.

No commit (audit only).

---

### Task 36: VM bootstrap test

**Files:**
- None (test against a clean macOS VM)

This is a non-skippable validation step before public push.

- [ ] **Step 1: Push to GitHub as PRIVATE repo first (for VM access)**

```bash
gh repo create jasonm4130/dotfiles --private --source ~/Work/Git/dotfiles --remote origin
git -C ~/Work/Git/dotfiles push -u origin main
```
Expected: repo created at `github.com/jasonm4130/dotfiles` (private).

- [ ] **Step 2: Provision a clean macOS VM**

Recommended: [Tart](https://tart.run/) for Apple Silicon.

```bash
brew install cirruslabs/cli/tart
tart pull ghcr.io/cirruslabs/macos-sequoia-base:latest
tart clone macos-sequoia-base dotfiles-test
tart run dotfiles-test
```

Wait for the VM to boot (1–2 minutes). The user/pass is `admin/admin` for the cirruslabs base image.

- [ ] **Step 3: Inside the VM, run the bootstrap one-liner**

In the VM Terminal:

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply jasonm4130
```

If the repo is private, you'll need a GitHub token for the VM. Use a fine-grained PAT with read-only access to the dotfiles repo, then:

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --branch main "https://USERNAME:TOKEN@github.com/jasonm4130/dotfiles.git"
```

Or, simpler: set the repo to **public** for the test (Step 7 of the parent flow), then run the canonical one-liner. We'll keep it public after the test.

- [ ] **Step 4: Watch for failures**

Common failure modes:
- Xcode CLT install hang (reboot if it never finishes)
- App Store apps fail (`mas`) — this is OK; user signs in to App Store after first apply
- 1Password CLI not loaded — also OK; user enables CLI integration after first apply
- A `run_once_*` script errors — investigate, fix the source, re-push, re-run

For this test, the goal is: **does the bootstrap RUN to completion without manual intervention beyond the documented one-time steps?**

- [ ] **Step 5: Check final state inside VM**

```bash
which chezmoi mise gitleaks starship
ls ~/.config/{starship.toml,wezterm/wezterm.lua,zed/settings.json}
ls ~/.claude/CLAUDE.md
echo "$ZSH_THEME"
```
Expected: all tools resolve, all config files exist, ZSH_THEME is empty (Starship in use), no error messages.

- [ ] **Step 6: Document any issues found, fix in the dotfiles repo**

For each failure: identify the cause, edit the source on the host, push, re-run on VM. Keep iterating until the bootstrap is clean.

- [ ] **Step 7: Tear down VM**

```bash
tart stop dotfiles-test
tart delete dotfiles-test
```

No commit (the fixes will be commits in their own right).

---

### Task 37: Make repo public

**Files:**
- None (GitHub setting)

- [ ] **Step 1: Run a final pre-public scan**

```bash
cd ~/Work/Git/dotfiles
gitleaks detect --redact --config ~/.config/gitleaks/gitleaks.toml
```
Expected: `0 leaks found`.

- [ ] **Step 2: Toggle visibility to public**

```bash
gh repo edit jasonm4130/dotfiles --visibility public --accept-visibility-change-consequences
```
Expected: repo URL is now publicly accessible.

- [ ] **Step 3: Verify the canonical one-liner works**

In a fresh Terminal session (NOT logged into GitHub):

```bash
curl -fsLS get.chezmoi.io | head -3
```
Expected: prints the chezmoi installer's first lines. If 404, halt — investigate.

- [ ] **Step 4: Update README's bootstrap section if anything changed**

If the VM test surfaced any caveats (e.g. an extra manual step), add them to README under "Manual one-time steps after bootstrap".

- [ ] **Step 5: Final commit + push**

```bash
cd ~/Work/Git/dotfiles
git add -A
git diff --cached --stat
git commit -m "docs: README updates from VM bootstrap test" --allow-empty
git push origin main
```

The `--allow-empty` is fine if no changes were needed.

---

## Done. Wrap-up

- [ ] **Step 1: Save the backup directory for at least 2 weeks**

The backup at `~/dotfiles-backup-2026-05-08/` is your safety net. Don't delete it for at least 2 weeks (until you're confident every config has been exercised).

- [ ] **Step 2: Add a chezmoi cheat-sheet to README**

Append to `README.md` (commit as a follow-up):

```markdown
## chezmoi cheat-sheet

| Task | Command |
|---|---|
| See what would change | `chezmoi diff` |
| Apply changes | `chezmoi apply` |
| Add a file from $HOME | `chezmoi add ~/.somefile` |
| Edit a tracked file (opens in editor) | `chezmoi edit ~/.somefile` |
| Re-add after editing | `chezmoi re-add ~/.somefile` |
| Open the source dir | `chezmoi cd` (or `cd ~/Work/Git/dotfiles`) |
| Check what's ignored | `chezmoi ignored \| grep <pattern>` |
| Run a single template | `chezmoi execute-template --file <path>` |
| Update from remote | `chezmoi update` |
```

- [ ] **Step 3: Mark the spec's open questions resolved**

Open `~/Work/Git/dotfiles/docs/specs/2026-05-08-dotfiles-design.md` Section 10 → Open questions, add a note that all three have been resolved by the implementation. Commit.

---

## Self-review notes (for the implementer)

This plan covers all 20 steps of the spec's Section 9 migration plan (Phases 1–12 above) plus pre-flight backup and VM test (steps 2 and 19 of the spec). Verified against the spec table-by-table:

- Locked decisions (Section 4) — every row covered
- Architecture (Section 5) — repo layout matches Task 1 + 11 + 16 + 17
- Bootstrap flow (Section 6) — Task 17 implements scripts; Task 18 implements local entry point; Task 36 validates the curl-pipe-sh path
- Component details (Section 7) — Tasks 14 (WezTerm), 15 (Starship), 16 (AGENTS.md), 19+20 (Zed), 23+24 (op secrets), 26+27 (mise config), 31 (macOS defaults), 33+34 (gitleaks), Task 10 (Claude allowlist)
- Migration steps 1–20 from spec — all mapped to numbered tasks above

Tasks are ordered to keep the seed machine in a working state at every checkpoint. Volta + pyenv removal happens AFTER mise is proven; Keychain entries are deleted AFTER op inject is verified working.
