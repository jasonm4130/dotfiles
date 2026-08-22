#!/usr/bin/env bash
# Hold an idle-sleep assertion for as long as THIS Claude Code session lives.
#
# Claude Code already spawns `caffeinate -i -t 300` while it works, but that is
# a rolling five-minute window: it lapses five minutes after the last activity.
# A session waiting on a long background agent, a CI run or a slow build is idle
# by that measure, so the Mac sleeps mid-task and scheduled launchd jobs miss
# their slots. This holds the assertion for the whole session instead.
#
# `-i` only. NOT `-d`: the display is still free to sleep, which is the point —
# the screen goes dark, the machine keeps working. `-m` keeps the disk awake so
# a long-running job is not stalled by spin-down.
#
# `-w <pid>` releases the assertion when that process exits, so a crashed or
# force-quit session cannot leave the machine permanently awake. There is no
# cleanup path to forget.
#
# Fails open and silent: this is a convenience, never a reason a session cannot
# start. SessionStart also fires on resume and after compaction, hence the
# duplicate check.
set -uo pipefail

command -v caffeinate >/dev/null 2>&1 || exit 0

# Walk up from this hook's shell to the `claude` process. $PPID is the shell
# claude invoked, so claude itself is one further up; the loop avoids depending
# on that depth staying fixed across versions.
pid=$$
for _ in 1 2 3 4 5 6 7 8; do
  read -r parent comm < <(ps -o ppid=,comm= -p "$pid" 2>/dev/null)
  [ -z "${parent:-}" ] && exit 0
  case "${comm##*/}" in claude) break ;; esac
  pid="$parent"
  [ "$pid" -le 1 ] && exit 0
done

case "$(ps -o comm= -p "$pid" 2>/dev/null)" in *claude) ;; *) exit 0 ;; esac

# Already holding one for this exact pid? Nothing to do.
pgrep -f "caffeinate -i -m -w $pid" >/dev/null 2>&1 && exit 0

nohup caffeinate -i -m -w "$pid" >/dev/null 2>&1 &
disown 2>/dev/null || true
exit 0
