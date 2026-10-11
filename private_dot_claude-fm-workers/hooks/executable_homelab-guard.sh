#!/usr/bin/env bash
# PreToolUse guard for firstmate fleet workers: refuse Bash commands that reach the homelab.
# Hooks block even in bypass mode, so this holds whatever permission mode a worker runs in.
# Reading or editing files that merely mention a homelab host (for example in brok-stacks) stays allowed.
set -uo pipefail
cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
# Judge what runs, not prose: drop heredoc bodies, quoted echo/printf arguments (keeping any
# $(...) or `...` inside them), and lookups (which/type/command -v, a bare --version/--help)
# that never contact a host. When what is left still hands text to an interpreter
# (`| bash`, `python3 - <<EOF`, `sh -c`), that text runs, so the whole command is judged.
# A failed strip judges the whole command too.
IFS= read -r -d '' strip <<'PY' || true
import re, sys

s = sys.argv[1]

def drop_heredoc_bodies(text):
    lines, out, i = text.split('\n'), [], 0
    opener = re.compile(r'(?<!<)<<(-?)[ \t]*(["\x27]?)([A-Za-z_][A-Za-z0-9_]*)\2')
    while i < len(lines):
        line = lines[i]
        out.append(line)
        i += 1
        for m in opener.finditer(line):
            dash, delim = m.group(1) == '-', m.group(3)
            end = next((j for j in range(i, len(lines))
                        if (lines[j].lstrip('\t') if dash else lines[j]) == delim), None)
            if end is None:
                return text  # unterminated: judge everything
            out.append(delim)
            i = end + 1
    return '\n'.join(out)

subst = re.compile(r'\$\((?:[^()]|\([^()]*\))*\)|`[^`]*`')

def quoted_to_placeholder(m):
    q = m.group(0)
    if q.startswith("'"):
        return '_'
    kept = subst.findall(q)
    if '$(' in subst.sub('', q) or q.count('`') != 2 * sum(k.startswith('`') for k in kept):
        return q  # a substitution this cannot parse: keep the text
    return ' '.join(['_'] + kept)

quoted = r'(?:\x27[^\x27]*\x27|"(?:[^"\\]|\\.)*")'
echo_args = re.compile(r'(?<![\w./-])(echo|printf)((?:[ \t]+-[A-Za-z]+)*)((?:[ \t]+' + quoted + r')+)')

def strip_echo(m):
    args = re.sub(quoted, quoted_to_placeholder, m.group(3))
    return m.group(1) + m.group(2) + args

lead = r'(^|[;&|(\n]|\$\()([ \t]*)'
lookup = re.compile(lead + r'(?:which|whereis|type|command[ \t]+-[vV])((?:[ \t]+[\w.+-]+)+)')
version = re.compile(lead + r'[\w./-]+[ \t]+--(?:version|help)\b')

skeleton = drop_heredoc_bodies(s)
skeleton = echo_args.sub(strip_echo, skeleton)
skeleton = lookup.sub(r'\1\2', skeleton)
skeleton = version.sub(r'\1\2', skeleton)
interpreter = (r'(^|[\s;&|(`])(bash|sh|zsh|dash|ksh|fish|eval|source|python[0-9.]*|node|perl|ruby|osascript)'
               r'(?=$|[\s;&|)])|(^|[;&|(\n])[ \t]*\.[ \t]')
print(s if re.search(interpreter, skeleton) else skeleton)
PY
judged=$(python3 -c "$strip" "$cmd" 2>/dev/null) || judged=$cmd
remote_tool='(^|[;&|(`[:space:]])(ssh|scp|sftp|ansible|ansible-playbook|ansible-pull|ansible-console|incus[[:space:]]+remote)([[:space:]]|$)'
hosts='192\.168\.5\.[0-9]|brok\.jasonmatthew\.me|[a-z0-9-]+\.jasonmatthew\.me|(^|[^a-z0-9-])(brok|dell-?0[12])([^a-z0-9-]|$)'
net_verb='(^|[;&|(`[:space:]])(curl|wget|nc|ncat|telnet|ping|rsync|http|https|docker[[:space:]]+(-H|--host|context)|mosh|xh)([[:space:]]|$)'
# Offline Ansible checks never contact a host, so they stay allowed.
offline_ansible='ansible-playbook[^;&|]*--(syntax-check|list-tasks|list-hosts|list-tags)|ansible-inventory[^;&|]*--(list|graph)'
check_cmd=$judged
if printf '%s' "$judged" | grep -Eiq "$offline_ansible" && ! printf '%s' "$judged" | grep -Eq '[;&|`]|\$\('; then
  check_cmd=''
fi
if printf '%s' "$check_cmd" | grep -Eiq "$remote_tool" ||
   { printf '%s' "$check_cmd" | grep -Eiq "$hosts" && printf '%s' "$check_cmd" | grep -Eiq "$net_verb"; }; then
  echo "homelab-guard: fleet workers may not reach the homelab (ssh/scp/ansible, or a network command to brok, the Dells or 192.168.5.x). Report the need to firstmate instead." >&2
  exit 2
fi
exit 0
