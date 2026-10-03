#!/usr/bin/env bash
# PreToolUse guard for firstmate fleet workers: refuse Bash commands that reach the homelab.
# Hooks block even in bypass mode, so this holds whatever permission mode a worker runs in.
# Reading or editing files that merely mention a homelab host (for example in brok-stacks) stays allowed.
set -uo pipefail
cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
remote_tool='(^|[;&|(`[:space:]])(ssh|scp|sftp|ansible|ansible-playbook|ansible-pull|incus[[:space:]]+remote)([[:space:]]|$)'
hosts='192\.168\.5\.[0-9]|brok\.jasonmatthew\.me|[a-z0-9-]+\.jasonmatthew\.me|(^|[^a-z0-9-])(brok|dell-?0[12])([^a-z0-9-]|$)'
net_verb='(^|[;&|(`[:space:]])(curl|wget|nc|ncat|telnet|ping|rsync|http|https|docker[[:space:]]+(-H|--host|context)|mosh|xh)([[:space:]]|$)'
if printf '%s' "$cmd" | grep -Eiq "$remote_tool" ||
   { printf '%s' "$cmd" | grep -Eiq "$hosts" && printf '%s' "$cmd" | grep -Eiq "$net_verb"; }; then
  echo "homelab-guard: fleet workers may not reach the homelab (ssh/scp/ansible, or a network command to brok, the Dells or 192.168.5.x). Report the need to firstmate instead." >&2
  exit 2
fi
exit 0
