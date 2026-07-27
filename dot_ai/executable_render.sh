#!/usr/bin/env bash
# Render ~/.ai/AGENTS.md into per-tool config files.
# Re-run automatically by chezmoi via run_onchange_after_07-agents-md-sync.
#
# Section fences let one source file target both tools. Each marker must be
# alone on its own line, spelled exactly:
#
#   <!-- codex-only:start -->   ...   <!-- codex-only:end -->
#   <!-- claude-only:start -->  ...   <!-- claude-only:end -->
#
# Claude Code ships equivalents of some guidance in its own system prompt, so
# repeating it there burns context twice. Codex has no such system prompt, where
# the same text is load-bearing. Fenced blocks reach only their target; unfenced
# content — the vast majority — goes to both.
#
# Order matters: validate the source, render to temp files, check those, and only
# then move them into place. Writing to the live paths first means a malformed
# source truncates the real config before anything notices.
set -euo pipefail

AI_DIR="$HOME/.ai"
SRC="$AI_DIR/AGENTS.md"
CLAUDE_DEST="$HOME/.claude/CLAUDE.md"
CODEX_DEST="$HOME/.codex/AGENTS.md"

die() { echo "❌ $*" >&2; exit 1; }

[ -f "$SRC" ] || die "source not found: $SRC"
[ -s "$SRC" ] || die "source is empty: $SRC — refusing to render empty configs"

# ---------------------------------------------------------------------------
# Validate fence structure BEFORE touching anything.
#
# Rejects: markers that aren't alone on a line (including a start and end on the
# same line), misspelled markers that the renderer would silently ignore, nesting,
# an end without a start, a mismatched pair, an unclosed block, and marker syntax
# inside a fenced code block (the renderer can't tell those from real markers).
# ---------------------------------------------------------------------------
if ! fence_errors=$(awk '
  BEGIN { incode = 0; open_name = ""; open_line = 0; errs = 0 }
  {
    if ($0 ~ /^[[:space:]]*(```|~~~)/) { incode = 1 - incode }

    # Anything that even resembles a fence gets scrutinised. A marker the
    # renderer would skip past is more dangerous than one it rejects.
    if ($0 ~ /(codex|claude)-only:(start|end)/) {
      if (incode) {
        printf("  line %d: fence marker inside a fenced code block\n", NR); errs++; next
      }
      if ($0 !~ /^[[:space:]]*<!-- (codex|claude)-only:(start|end) -->[[:space:]]*$/) {
        printf("  line %d: marker must be alone on its line, spelled exactly: %s\n", NR, $0)
        errs++; next
      }
      match($0, /(codex|claude)-only/); name = substr($0, RSTART, RLENGTH)
      kind = ($0 ~ /:start/) ? "start" : "end"

      if (kind == "start") {
        if (open_name != "") {
          printf("  line %d: nested fence — %s still open from line %d\n", NR, open_name, open_line)
          errs++
        } else { open_name = name; open_line = NR }
      } else {
        if (open_name == "") {
          printf("  line %d: %s:end with no matching start\n", NR, name); errs++
        } else if (open_name != name) {
          printf("  line %d: %s:end closes %s opened at line %d\n", NR, name, open_name, open_line)
          errs++
        } else { open_name = ""; open_line = 0 }
      }
    }
  }
  END {
    if (open_name != "") { printf("  line %d: %s:start never closed\n", open_line, open_name); errs++ }
    exit (errs > 0)
  }
' "$SRC"); then
  echo "❌ malformed fences in $SRC:" >&2
  echo "$fence_errors" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Render to temp files.
# ---------------------------------------------------------------------------
tmp_claude=$(mktemp) && tmp_codex=$(mktemp)
trap 'rm -f "$tmp_claude" "$tmp_codex"' EXIT

# render <marker-to-drop> <dest>
render() {
  awk -v m="$1" '
    index($0, "<!-- " m ":start -->") { skip = 1; next }
    index($0, "<!-- " m ":end -->")   { skip = 0; next }
    !skip
  ' "$SRC" \
    | sed -E '/^[[:space:]]*<!-- (codex|claude)-only:(start|end) -->[[:space:]]*$/d' \
    | cat -s > "$2"
}

render codex-only "$tmp_claude"   # Claude Code reads this — drop Codex-only blocks
render claude-only "$tmp_codex"   # Codex reads this — drop Claude-only blocks

# ---------------------------------------------------------------------------
# Check the rendered output before it goes live. ERE (-E), not BRE alternation:
# `\|` is a GNU/ugrep extension BSD grep ignores, and since this checks for
# *absence*, a grep that can't parse the pattern returns no-match and passes.
# ---------------------------------------------------------------------------
for f in "$tmp_claude" "$tmp_codex"; do
  [ -s "$f" ] || die "render produced an empty file — refusing to install"
  grep -Eq '(codex|claude)-only:(start|end)' "$f" && die "fence marker survived into a render"
done
# Both renders must keep everything that was never fenced.
unfenced=$(awk '
  index($0, ":start -->") { skip = 1; next }
  index($0, ":end -->")   { skip = 0; next }
  !skip
' "$SRC" | grep -c '^## ' || true)
for f in "$tmp_claude" "$tmp_codex"; do
  got=$(grep -c '^## ' "$f" || true)
  [ "$got" -ge "$unfenced" ] || die "render dropped sections (expected ≥$unfenced headings, got $got)"
done

mkdir -p "$(dirname "$CLAUDE_DEST")" "$(dirname "$CODEX_DEST")"
mv "$tmp_claude" "$CLAUDE_DEST"
mv "$tmp_codex" "$CODEX_DEST"

printf '✅ rendered AGENTS.md → ~/.claude/CLAUDE.md (%s lines) and ~/.codex/AGENTS.md (%s lines)\n' \
  "$(wc -l < "$CLAUDE_DEST" | tr -d ' ')" "$(wc -l < "$CODEX_DEST" | tr -d ' ')"
