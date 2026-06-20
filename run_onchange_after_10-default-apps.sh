#!/usr/bin/env bash
# Default apps: make Zed the default editor for code/text file types, so Finder
# double-click and terminal cmd+click (Ghostty → `open` → LaunchServices) open
# them in Zed. Idempotent; run_onchange re-applies whenever this list changes.
# Requires `duti` (in Brewfile). git keeps nvim via .gitconfig core.editor.
#
# Many code extensions have no standalone UTI — macOS assigns a deterministic
# dynamic UTI (dyn.*) per extension. We resolve each extension's real UTI at
# runtime via mdls and bind Zed to THAT; this works for both named
# (public.python-script) and dynamic UTIs and overrides other editors' claims.
set -euo pipefail

ZED_ID="dev.zed.Zed"

if ! command -v duti >/dev/null 2>&1; then
  echo "⚠  duti not installed — skipping default-app setup (brew install duti)"
  exit 0
fi
if [ ! -d "/Applications/Zed.app" ]; then
  echo "⚠  Zed.app not found — skipping default-app setup"
  exit 0
fi

echo "🛠  Setting Zed as default for code/text file types..."

# Curated code/text extensions. Deliberately EXCLUDES html/htm, svg, csv/tsv
# (those should default to a browser / image viewer / spreadsheet).
exts=(
  # plain text & docs
  txt text md markdown mdx rst log
  # config & data
  json jsonc json5 yaml yml toml ini conf cfg properties env editorconfig xml
  # shell
  sh bash zsh fish ps1
  # web
  css scss sass less ts tsx js jsx mjs cjs vue svelte astro
  # languages
  py rb go rs c h cpp cc cxx hpp java kt kts swift php pl lua r jl dart scala clj ex exs hs ml sql graphql proto
  # build / infra
  tf tfvars gradle
)

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

set_count=0
for ext in "${exts[@]}"; do
  probe="$tmpdir/probe.$ext"; : > "$probe"
  uti=$(mdls -name kMDItemContentType -raw "$probe" 2>/dev/null || true)
  rm -f "$probe"
  case "$uti" in
    "" | "(null)") continue ;;
  esac
  if duti -s "$ZED_ID" "$uti" all 2>/dev/null; then
    set_count=$((set_count + 1))
  fi
done

# Broad parent UTIs as a safety net for code/text types not listed above.
utis=(
  public.plain-text public.source-code public.shell-script public.script
  public.json public.xml public.make-source
  public.python-script public.ruby-script public.perl-script
)
uti_count=0
for uti in "${utis[@]}"; do
  if duti -s "$ZED_ID" "$uti" all 2>/dev/null; then
    uti_count=$((uti_count + 1))
  fi
done

echo "✅ Zed default: $set_count/${#exts[@]} extensions + $uti_count/${#utis[@]} parent UTIs."
