#!/usr/bin/env bash
# Turns Tailscale's subnet routes off on the home network and on elsewhere.
#
# At home the gateway routes to the other home subnets directly, which is
# faster than Tailscale: the macOS network extension tops out at about one
# CPU core of WireGuard. Tailscale itself stays up (MagicDNS, 100.x peers);
# only --accept-routes changes.
#
# "Home" is a default gateway whose MAC is listed, one per line, in
# ~/.config/tailscale-home/gateway-macs (private; chezmoi does not manage it).
# Without that file the script changes nothing.
#
# Run by the dev.jasonmatthew.tailscale-home-routes launchd agent on every
# network change. Logs to ~/Library/Logs/tailscale-home-routes.log.
set -uo pipefail

MACS_FILE="${TAILSCALE_HOME_MACS:-$HOME/.config/tailscale-home/gateway-macs}"
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
[ -x "$TS" ] || TS="$(command -v tailscale || true)"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

[ -n "$TS" ] || { log "tailscale CLI not found; skipping"; exit 0; }
[ -r "$MACS_FILE" ] || { log "no $MACS_FILE; skipping"; exit 0; }

# Normalise a MAC to lower-case, zero-padded octets (arp prints 8:0:... ).
norm_mac() {
  tr 'A-F' 'a-f' | awk -F: 'NF==6 { for (i=1;i<=6;i++) printf "%s%02s", (i>1?":":""), $i; print "" }' | tr ' ' '0'
}

# The physical default route, ignoring Tailscale's utun default.
gw="$(netstat -rn -f inet 2>/dev/null | awk '$1=="default" && $NF !~ /^utun/ { print $2; exit }')"
iface="$(netstat -rn -f inet 2>/dev/null | awk '$1=="default" && $NF !~ /^utun/ { print $NF; exit }')"

home=false
if [ -n "$gw" ] && [[ "$gw" =~ ^[0-9.]+$ ]]; then
  # Fill the ARP entry right after a network change.
  ping -c 1 -t 2 ${iface:+-b "$iface"} "$gw" >/dev/null 2>&1 || true
  gw_mac="$(arp -n "$gw" 2>/dev/null | awk '{ print $4 }' | norm_mac)"
  if [ -n "$gw_mac" ] && grep -v '^\s*#' "$MACS_FILE" | norm_mac | grep -qx "$gw_mac"; then
    home=true
  fi
fi

want=true; $home && want=false
have="$("$TS" debug prefs 2>/dev/null | awk -F': ' '/"RouteAll"/ { gsub(/[ ,]/, "", $2); print $2 }')"

if [ -z "$have" ]; then
  log "could not read Tailscale prefs (not running?); skipping"
  exit 0
fi

if [ "$have" != "$want" ]; then
  if "$TS" set --accept-routes="$want" 2>&1; then
    log "home=$home gateway=${gw:-none}: accept-routes $have -> $want"
  else
    log "home=$home: tailscale set --accept-routes=$want failed"
  fi
fi
