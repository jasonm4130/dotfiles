#!/usr/bin/env bash
# Kiri (runkiri.com) is the Docker engine on this Mac. It has no Homebrew cask
# and updates itself, so chezmoi only makes sure it is installed. The official
# installer checks the download's SHA-256, code signature and notarization,
# puts Kiri.app in /Applications and runs `kiri setup --no-domains` (no sudo).
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "kiri: not macOS, skipping"
    exit 0
fi

if [[ -d /Applications/Kiri.app || -d "$HOME/Applications/Kiri.app" ]]; then
    echo "kiri: already installed, it updates itself"
    exit 0
fi

if ! curl --fail --silent --head https://runkiri.com/install.sh >/dev/null; then
    echo "kiri: runkiri.com unreachable, skipping; re-run chezmoi apply later"
    exit 0
fi

kiri_installer="$(mktemp -t kiri-install)"
trap 'rm -f "$kiri_installer"' EXIT
curl --fail --silent --show-error --location \
    https://runkiri.com/install.sh --output "$kiri_installer"
bash "$kiri_installer"
