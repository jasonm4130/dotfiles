#!/usr/bin/env bash
# Retires the Mac's UniFi drift check. jasonm4130/unifi installed
# dev.jasonmatthew.unifi-drift by hand (its docs/runbooks/drift-check.md), so
# chezmoi never owned the plist and has no source file to stop deploying. The
# check moved to dell-01's host on 2026-10-11 (brok-stacks nodes/roles/unifi_drift,
# alerting through brok's unifi-drift rule group) and ran clean there on
# 2026-10-12 09:40, so the Mac copy only duplicates it, and skips whenever the
# laptop is off the LAN. Runs once per machine; a machine without the job is a no-op.
set -euo pipefail

LABEL="dev.jasonmatthew.unifi-drift"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "🧹 Unloading $LABEL (the UniFi drift check runs on dell-01 now)"
  launchctl bootout "$DOMAIN/$LABEL"
fi

if [[ -e "$PLIST" ]]; then
  rm -f "$PLIST"
  echo "✅ Removed $PLIST"
fi
