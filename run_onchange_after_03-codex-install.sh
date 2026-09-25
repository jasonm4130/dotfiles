#!/usr/bin/env bash
# Codex owns its standalone package and updates; chezmoi ensures it is installed.
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
codex_managed="$HOME/.codex/packages/standalone/current/bin/codex"
if [[ -x "$codex_managed" ]] &&
   [[ "$HOME/.local/bin/codex" -ef "$codex_managed" ]]; then
    "$HOME/.local/bin/codex" --version
    exit 0
fi

codex_installer="$(mktemp -t codex-install)"
trap 'rm -f "$codex_installer"' EXIT
curl --fail --silent --show-error --location \
    https://chatgpt.com/codex/install.sh --output "$codex_installer"
CODEX_NON_INTERACTIVE=1 sh "$codex_installer"
"$HOME/.local/bin/codex" --version
