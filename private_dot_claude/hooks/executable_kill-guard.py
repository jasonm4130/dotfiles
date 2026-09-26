#!/usr/bin/env python3
"""kill-guard: PreToolUse(Bash) hook that blocks process kills broad enough to hit GUI apps.

Root cause it guards against (2026-09-26/27): subagents ran `pkill -f "cat" -x` and
`pkill -f "cat" -U 501` to stop a stuck `cat > file`. "cat" is a substring of
"/Applications", and BSD pkill stops parsing options at the first pattern, so the
trailing -x / -U became extra patterns. Every running app was killed.

Blocks:
  - killall, always
  - pkill (or pgrep piped into kill) with an option after the pattern, or several patterns
  - pkill -v (inverts the match)
  - pkill without -x whose pattern, probed with read-only pgrep, currently matches any
    app/system process or more than MAX_HITS processes
  - pkill without -f whose pattern is a generic process name
Fail-open on anything it cannot parse: a buggy guard must not block unrelated commands.
"""
import json
import os
import re
import shlex
import subprocess
import sys

OPTS_WITH_ARG = set("FGgjPtUusc")
GENERIC_NAMES = {
    "cat", "node", "python", "python3", "bash", "sh", "zsh", "sleep", "ruby", "java",
    "claude", "docker", "op", "git", "tail", "less", "vim", "nvim", "bun", "deno",
}
PROTECTED = ("/Applications/", "/System/", "/usr/libexec/", "/usr/sbin/", "/Library/")
MAX_HITS = 10
# pgrep only matters when its output feeds a kill.
PGREP_TO_KILL = re.compile(r"pgrep[^;\n]*\|\s*xargs[^|;\n]*\bkill\b|\bkill\b[^;\n]*\$\(\s*pgrep")
ADVICE = (
    "Kill by PID instead: `pgrep -fl '<full path or unique args>'`, check the list, "
    "then `kill <pid>`. Put all pkill/pgrep options BEFORE the pattern (BSD pkill "
    "treats anything after it as another pattern)."
)


def segments(cmd):
    # Redirections (2>/dev/null, 2>&1, &>log) are not arguments; newlines separate commands.
    cmd = re.sub(r"(\d*|&)(>>?|<)(&\d+|\s*[^\s;&|()]+)", " ", cmd).replace("\n", ";")
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=";&|()")
    lex.whitespace_split = True
    seg = []
    for tok in lex:
        if tok and set(tok) <= set(";&|()"):
            if seg:
                yield seg
            seg = []
        else:
            seg.append(tok)
    if seg:
        yield seg


def strip_prefix(seg):
    # sudo / env VAR=x / command / exec before the real program
    i = 0
    while i < len(seg) and (seg[i] in ("sudo", "env", "command", "exec", "nohup") or "=" in seg[i] and not seg[i].startswith("-")):
        i += 1
    return seg[i:]


def check_pkill(args):
    flags, patterns, after_pattern_opt = set(), [], None
    i = 0
    while i < len(args):
        a = args[i]
        if patterns:
            if a.startswith("-") and a != "-":
                after_pattern_opt = a
            patterns.append(a)
        elif a == "--":
            patterns.extend(args[i + 1:])
            break
        elif a.startswith("-") and len(a) > 1:
            body = a[1:]
            if body.isdigit() or body.isupper():  # -9, -TERM
                pass
            else:
                for j, ch in enumerate(body):
                    flags.add(ch)
                    if ch in OPTS_WITH_ARG:
                        if j == len(body) - 1:
                            i += 1
                        break
        else:
            patterns.append(a)
        i += 1

    if after_pattern_opt:
        return f"option `{after_pattern_opt}` comes after the pattern, so pkill treats it as a second pattern, not a filter"
    if len(patterns) > 1:
        return f"several patterns {patterns}; each one matches independently"
    if not patterns:
        return None
    if "v" in flags:
        return "-v inverts the match and kills everything else"
    p = patterns[0]
    if "x" in flags:
        return None
    if "f" not in flags and p.lower() in GENERIC_NAMES:
        return f"`{p}` matches every process with that name, not just yours"
    if "$" in p or "`" in p:
        return None  # unexpanded variable: cannot probe it, fail open
    # Ask pgrep (read-only) what the pattern hits right now, as the real pkill would.
    try:
        out = subprocess.run(
            ["pgrep", "-l" + ("f" if "f" in flags else "") + ("i" if "i" in flags else ""), "--", p],
            capture_output=True, text=True, timeout=3, check=False,
        ).stdout.splitlines()
    except Exception:
        return None
    hits = [l for l in out if int(l.split()[0]) not in (os.getpid(), os.getppid())]
    shared = [l.split(None, 1)[1][:90] for l in hits if any(r in l for r in PROTECTED)]
    if shared:
        return f"pattern {p!r} currently matches {len(hits)} processes including apps/system ones:\n  " + "\n  ".join(shared[:5])
    if len(hits) > MAX_HITS:
        return f"pattern {p!r} currently matches {len(hits)} processes (limit {MAX_HITS})"
    return None


def main():
    try:
        data = json.load(sys.stdin)
        cmd = data.get("tool_input", {}).get("command", "")
        if "kill" not in cmd:
            return 0
        segs = list(segments(cmd))
    except Exception:
        return 0

    for seg in segs:
        seg = strip_prefix(seg)
        if not seg:
            continue
        prog = seg[0].rsplit("/", 1)[-1]
        reason = None
        if prog == "killall":
            reason = "killall matches by name across all your processes"
        elif prog == "pkill" or (prog == "pgrep" and PGREP_TO_KILL.search(cmd)):
            reason = check_pkill(seg[1:])
        if reason:
            print(f"BLOCKED by kill-guard: {' '.join(seg)}\n{reason}.\n{ADVICE}", file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
