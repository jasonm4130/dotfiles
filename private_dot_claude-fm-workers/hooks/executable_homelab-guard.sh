#!/usr/bin/env bash
# PreToolUse guard for firstmate fleet workers: refuse Bash commands that reach the homelab.
# Hooks block even in bypass mode, so this holds whatever permission mode a worker runs in.
# Reading or editing files that merely mention a homelab host (for example in brok-stacks) stays allowed.
set -uo pipefail
cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
remote_tool='(^|[;&|(`[:space:]])(ssh|scp|sftp|ansible|ansible-playbook|ansible-pull|ansible-console|incus[[:space:]]+remote)([[:space:]]|$)'
hosts='192\.168\.5\.[0-9]|brok\.jasonmatthew\.me|[a-z0-9-]+\.jasonmatthew\.me|(^|[^a-z0-9-])(brok|dell-?0[12])([^a-z0-9-]|$)'
net_verb='(^|[;&|(`[:space:]])(curl|wget|nc|ncat|telnet|ping|rsync|http|https|docker[[:space:]]+(-H|--host|context)|mosh|xh)([[:space:]]|$)'
# Offline Ansible checks never contact a host, so they stay allowed.
offline_ansible='ansible-playbook[^;&|]*--(syntax-check|list-tasks|list-hosts|list-tags)|ansible-inventory[^;&|]*--(list|graph)'
check_cmd=$cmd
if printf '%s' "$cmd" | grep -Eiq "$offline_ansible" && ! printf '%s' "$cmd" | grep -Eq '[;&|`]|\$\('; then
  check_cmd=''
fi
if printf '%s' "$check_cmd" | grep -Eiq "$remote_tool" ||
   { printf '%s' "$check_cmd" | grep -Eiq "$hosts" && printf '%s' "$check_cmd" | grep -Eiq "$net_verb"; }; then
  echo "homelab-guard: fleet workers may not reach the homelab (ssh/scp/ansible, or a network command to brok, the Dells or 192.168.5.x). Report the need to firstmate instead." >&2
  exit 2
fi
exit 0
