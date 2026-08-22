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

# Recovery hatch, defined before the guard so it exists even on the early return.
# The guard below is on *attempted*, which means a shell that started while
# 1Password was locked will not retry on its own — unlocking afterwards would
# otherwise leave that terminal permanently without secrets and no obvious way
# back except opening a new tab. This is the way back, and the warning names it.
op-env-reload() {
  unset _OP_ENV_TRIED
  source "$HOME/.config/op/load-env.zsh"
}

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

# xtrace off for the block that holds plaintext. `zsh -x -i`, the ordinary way to
# debug a slow or broken startup, otherwise traces every command here and prints
# each resolved secret to stderr — where it lands in scrollback and in whatever
# the user pastes into a bug report. Saved and restored rather than left off: -x
# was the user's request and the rest of .zshrc still deserves it. No `return`
# between here and the restore, or xtrace would stay off for the whole session.
_op_xtrace=0
[[ -o xtrace ]] && _op_xtrace=1
set +x

# Capture first, THEN parse. `eval "$(op-fast ...)" || warn` cannot work: a failed
# op-fast yields an empty substitution, and `eval ""` exits 0, so the warning
# branch is unreachable. That was the previous behaviour in .zshrc — a locked
# 1Password produced silence and an unset $TAVILY_API_KEY with no explanation.
#
# No `local` here: at sourced top level zsh treats it as a declaration and echoes
# `_op_env=''` into an interactive terminal. Plain assignment, unset at the end.
if _op_env=$(op-fast inject -i "$HOME/.config/op/env.tmpl" 2>/dev/null) && [[ -n $_op_env ]]; then
  # Parsed, NOT eval'd. `op-fast inject` is raw textual substitution with no shell
  # quoting, so eval handed every secret to the zsh parser as code: `$$` became
  # the PID (wrong value, no error anywhere), a value with one `"` raised
  # `(eval):1: unmatched "` and aborted every export after it — and because
  # $_op_env was non-empty the elif below never fired, so that was a half-loaded
  # environment with no warning — and `"; cmd; echo "` simply ran cmd.
  #
  # `read -r` does no expansion and `typeset` treats its argument as data, so a
  # value can contain anything: spaces, quotes, $, backticks, further `=`.
  #
  # Records are lines shaped `IDENTIFIER=`; the FIRST `=` is the separator, so
  # values keep any others. Everything else is skipped, which is what lets
  # env.tmpl keep its comment block and blank lines. A consequence: a value
  # spanning multiple lines is not representable here and would be truncated at
  # its first newline. env.tmpl holds single-line tokens; a multi-line secret
  # (a PEM key, say) belongs in an on-demand `op-fast read`, the way
  # STRIPE_SECRET_KEY and CLOUDFLARE_API_TOKEN already are.
  #
  # The herestring keeps this in the current shell — a pipe would fork, and the
  # exports would die with the subshell.
  while IFS= read -r _op_line; do
    [[ $_op_line =~ '^[A-Za-z_][A-Za-z0-9_]*=' ]] || continue
    typeset -gx "${_op_line%%=*}=${_op_line#*=}"
  done <<< "$_op_env"
elif [[ -o interactive ]]; then
  # Only where a human will read it. A login shell feeding a GUI launcher must
  # stay quiet — its stderr goes to a system log nobody checks.
  print -u2 "⚠ 1Password not loaded — unlock the app (or \`op signin\`), then run \`op-env-reload\`"
fi

unset _op_env _op_line

(( _op_xtrace )) && set -x
unset _op_xtrace
