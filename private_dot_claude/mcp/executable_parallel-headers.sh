#!/bin/bash
# headersHelper for the Parallel MCP server: prints the auth header with the key read from 1Password.
set -euo pipefail
key=$(op read "op://Private/Parallel Key/credential")
printf '{"Authorization":"Bearer %s"}\n' "$key"
