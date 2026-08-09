# Loads 1Password-backed env vars. Sourced by BOTH ~/.zprofile (login) and
# ~/.zshrc (interactive) — a normal terminal tab is login+interactive and runs
# the pair, so this lives in one file with a once-per-process guard rather than
# being copied into both. Two copies is how the dead `||` below went unnoticed.
#
# On persistence: op-fast caches secrets in the macOS Keychain, which is
# process-independent and survives reboots. That is the persistence layer, and
# it is why Touch ID is not prompted per tty. This file only re-exports from
# that cache into the current process (~30ms warm), so there is nothing to
# persist at the shell level — only the redundant second call to avoid.
#
# TTLs are in ~/.config/op-fast/config.toml (4h default, 15m for stripe-secret).

# Guard on ATTEMPTED, not on succeeded: a locked 1Password fails, and gating on
# success would let .zshrc retry what .zprofile just failed — two auth attempts
# and the same warning printed twice into one terminal.
#
# Deliberately NOT exported. .zprofile and .zshrc run in the SAME process, so a
# plain variable already suppresses the second call — which is all this needs to
# do. Exporting would also suppress it in every CHILD shell, which is worse than
# redundant: the child would keep whatever the parent resolved, indefinitely, and
# op-fast's TTL would never get a chance to expire a rotated secret. Let children
# re-ask; op-fast answers from its Keychain cache in ~30ms and owns freshness.
[[ -n ${_OP_ENV_TRIED:-} ]] && return 0

command -v op-fast >/dev/null 2>&1 || return 0
[[ -r $HOME/.config/op/env.tmpl ]] || return 0

typeset -g _OP_ENV_TRIED=1

# Capture first, THEN eval. `eval "$(op-fast ...)" || warn` cannot work: a failed
# op-fast yields an empty substitution, and `eval ""` exits 0, so the warning
# branch is unreachable. That was the previous behaviour in .zshrc — a locked
# 1Password produced silence and an unset $TAVILY_API_KEY with no explanation.
#
# No `local` here: at sourced top level zsh treats it as a declaration and echoes
# `_op_env=''` into an interactive terminal. Plain assignment, unset at the end.
if _op_env=$(op-fast inject -i "$HOME/.config/op/env.tmpl" 2>/dev/null) && [[ -n $_op_env ]]; then
  eval "$_op_env"
elif [[ -o interactive ]]; then
  # Only where a human will read it. A login shell feeding a GUI launcher must
  # stay quiet — its stderr goes to a system log nobody checks.
  print -u2 "⚠ 1Password not loaded — unlock the app or run \`op signin\`"
fi

unset _op_env
