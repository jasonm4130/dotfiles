#!/usr/bin/env bash
# graphify-nudge: when a graphify knowledge graph exists in the project, nudge
# toward it before raw text search. PreToolUse/Bash hook. Fail-open throughout.
set -uo pipefail

# Pull the bash command out of the hook's stdin JSON (handle nested + flat shapes).
cmd=$(jq -r '.tool_input.command // .command // empty' 2>/dev/null) || cmd=""

case "$cmd" in
  *grep*|*rg\ *|*ripgrep*|*find\ *|*fd\ *|*ack\ *|*ag\ *)
    if [ -f graphify-out/graph.json ]; then
      printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"graphify: Knowledge graph exists. Read graphify-out/GRAPH_REPORT.md for god nodes and community structure before searching raw files."}}'
    fi
    ;;
esac

exit 0
