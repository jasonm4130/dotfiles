# Loads 1Password-backed env vars. Sourced by BOTH ~/.zprofile (login) and
# ~/.zshrc (interactive) — a normal terminal tab is login+interactive and runs
# the pair, so this lives in one file with a sentinel rather than being copied
# into both. Two copies is how the dead `||` below went unnoticed.
#
# On persistence: op-fast caches secrets in the macOS Keychain, which is
# process-independent and survives reboots. That is the persistence layer, and
# it is why Touch ID is not prompted per tty. This file only re-exports from
# that cache into the current process (~30ms warm), so there is nothing to
# persist at the shell level — only the redundant second call to avoid.
#
# TTLs are in ~/.config/op-fast/config.toml (4h default, 15m for stripe-secret).

[[ -n ${_OP_ENV_LOADED:-} ]] && return 0
command -v op-fast >/dev/null 2>&1 || return 0
[[ -r $HOME/.config/op/env.tmpl ]] || return 0

# Capture first, THEN eval. `eval "$(op-fast ...)" || warn` cannot work: a failed
# op-fast yields an empty substitution, and `eval ""` exits 0, so the warning
# branch is unreachable. That was the previous behaviour in .zshrc — a locked
# 1Password produced silence and an unset $TAVILY_API_KEY with no explanation.
local _op_env
if _op_env=$(op-fast inject -i "$HOME/.config/op/env.tmpl" 2>/dev/null) && [[ -n $_op_env ]]; then
  eval "$_op_env"
  export _OP_ENV_LOADED=1
elif [[ -o interactive ]]; then
  # Only where a human will read it. A login shell feeding a GUI launcher must
  # stay quiet — its stderr goes to a system log nobody checks.
  print -u2 "⚠ 1Password not loaded — unlock the app or run \`op signin\`"
fi
