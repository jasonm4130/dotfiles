#!/usr/bin/env bash
# Daily chezmoi drift sentinel, run headless by launchd. Notifies when managed
# files differ from the source so drift gets settled the day it appears
# instead of surfacing as an apply failure weeks later.
set -uo pipefail

CHEZMOI=/opt/homebrew/bin/chezmoi

drift="$("$CHEZMOI" status 2>&1)" || {
  echo "=== $(date): chezmoi status failed ==="
  echo "$drift"
  exit 1
}

if [[ -n "$drift" ]]; then
  count=$(printf '%s\n' "$drift" | wc -l | tr -d ' ')
  echo "=== $(date): drift detected ($count entries) ==="
  printf '%s\n' "$drift"
  /usr/bin/osascript -e "display notification \"$count entr(ies) out of sync — run chezmoi-drift to settle\" with title \"chezmoi drift\""
else
  echo "=== $(date): no drift ==="
fi
