#!/usr/bin/env bash
# Clone the private repo map that ~/Code/AGENTS.md links to. A failed clone
# (no GitHub access yet on a fresh machine) warns and leaves apply running.
set -uo pipefail
dest="$HOME/Code/.map"
[[ -d "$dest/.git" ]] && exit 0
mkdir -p "$HOME/Code"
git clone -q git@github.com:jasonm4130/code-map.git "$dest" \
  || echo "warning: could not clone the code map to $dest; clone it once GitHub SSH works" >&2
exit 0
