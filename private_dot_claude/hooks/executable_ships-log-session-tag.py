#!/usr/bin/env python3
"""ships-log-session-tag: SessionStart hook that tags a session for the ships-log shipper.

Writes {v, session_id, fm_task_id, cwd, host, ts} to
~/.local/state/ships-log/sessions/<session_id>.json (core's SessionTagSchema in
jasonm4130-labs/ships-log). The shipper ships the tag once the session's own
transcript has shipped, which gives the server an exact session -> Firstmate task
join; fm_task_id comes from FM_TASK_ID, which fm-spawn sets for crewmates.

Registered in both ~/.claude and ~/.claude-fm-workers settings. It prints nothing,
because SessionStart stdout becomes model context, and it never fails the session:
an unwritable state dir or odd input just means no tag.
"""
import json
import os
import re
import socket
import sys
from datetime import datetime, timezone

# Core's SessionIdSchema; also keeps the id safe as a file name.
SESSION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (ValueError, OSError):
        return
    if not isinstance(payload, dict):
        return
    session_id = payload.get("session_id")
    if not isinstance(session_id, str) or not SESSION_ID.match(session_id) or ".." in session_id:
        return

    cwd = payload.get("cwd")
    if not isinstance(cwd, str):
        cwd = os.getcwd()
    task = os.environ.get("FM_TASK_ID") or None
    tag = {
        "v": 1,
        "session_id": session_id,
        "fm_task_id": task[:128] if task else None,
        "cwd": cwd[:4096],
        "host": (socket.gethostname().split(".")[0] or "unknown")[:64],
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }

    # Must match session_tags_dir in ~/.config/ships-log/shipper.json.
    state = os.environ.get("SHIPS_LOG_STATE_DIR") or os.path.join(os.path.expanduser("~"), ".local", "state", "ships-log")
    tags_dir = os.path.join(state, "sessions")
    os.makedirs(tags_dir, mode=0o700, exist_ok=True)
    # Write then rename: the shipper reads *.json, so it never sees a partial tag.
    final = os.path.join(tags_dir, f"{session_id}.json")
    tmp = f"{final}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(tag, f)
    os.replace(tmp, final)


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 — a tagging failure must never surface in the session
        pass
