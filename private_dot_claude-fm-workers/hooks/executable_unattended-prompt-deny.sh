#!/usr/bin/env bash
# PermissionRequest hook for unattended fleet sessions: nobody can answer a prompt
# in these panes, so turn every prompt into an immediate refusal the session reports.
cat >/dev/null
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Unattended fleet session: no one can answer a permission prompt here. Do not retry or rephrase. Report the exact action to firstmate in a needs-decision status line and continue with other work."}}}'
