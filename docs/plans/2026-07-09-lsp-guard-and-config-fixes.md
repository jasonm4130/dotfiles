# LSP guard & config fixes (dotfiles)

Source: LSP alignment audit 2026-07-09 (workflow `wf_cf71aaba-7a6`). This repo is
the chezmoi source; files render to `$HOME` on `chezmoi apply`.

## Global Constraints

- This is a chezmoi SOURCE repo: edit `private_dot_claude/**` / `dot_config/**`,
  never the rendered copies under `$HOME`. Do NOT run `chezmoi apply` — application
  happens post-merge in the controller session after a `chezmoi diff` check.
- Node ≥ 20 built-ins only (the hook runs bare `node`, no package.json); tests use
  `node:test` and run via `node --test tests/`.
- The new top-level `tests/` directory MUST be added to `.chezmoiignore`
  (entries `tests` and `tests/**`, alongside the existing `docs` entries) so it
  never deploys to `$HOME`.
- The hook must stay FAIL-OPEN: malformed/missing stdin JSON, or any tool_name
  other than `Grep` → exit 0 with no output.

# Task 1: Rewrite lsp-first-guard.js (fix false-negative leaks, migrate output contract), with tests

**Files:** `private_dot_claude/hooks/lsp-first-guard.js` (rewrite),
`tests/lsp-first-guard.test.mjs` (new), `.chezmoiignore` (add tests ignore).

An empirical 40-case audit found the guard leaks whole classes of code-symbol
greps. Write the tests FIRST from the matrix below, confirm the leak cases fail
against the current hook, then rewrite. Required changes:

1. **Normalize the pattern before classification** (classification only — never
   alter the tool call): strip one trailing `\b`; unescape `\(`→`(` and `\)`→`)`.
   So `getUserData\b` and `fetchData\(` classify like their bare forms.
2. **Error-words allow rule** (now `/error|warning|failed|exception/i`, unanchored
   substring): replace with message-like requirement
   `/\b(error|warning|failed|exception)\b[\s:]/i`. `Failed to connect` and
   `error: connection refused` still pass; `handleError`, `ErrorBoundary`,
   `ValidationException`, `fetch_failed_rows` no longer do.
3. **Config-key allow rule** (now `/^[\w-]+\.[\w-]+/` — a strict superset of the
   method-call block rule, which is therefore dead code): replace with
   all-lowercase dotted form `/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/`. `server.port` and
   `foo.bar-baz` still pass; mixed-case `this.handleSubmit`, `React.Component`
   now reach the method-pattern block rule. Deliberate trade-off: all-lowercase
   `res.send` stays allowed — ambiguous with config keys; false positives are
   worse than false negatives here.
4. **TODO-prefix allow rule**: `/^(TODO|FIXME|HACK|NOTE|XXX|WARN)\b/`
   case-SENSITIVE with word boundary. `warnUser`, `NoteEditor` no longer pass.
5. **File-scope allow**: test `tool_input.glob` and `tool_input.path` SEPARATELY,
   each END-anchored:
   `/\.(json|ya?ml|toml|sh|bash|zsh|md|markdown|txt|env|plist|conf|ini|cfg|lock|log|csv|tsv)$/i`
   (keep the existing `type` check unchanged). A path like
   `/x/work.log-analyzer/src` no longer disables the guard.
6. **Add Pascal_Snake block regex**: `/^[A-Z][a-zA-Z0-9]*(_[A-Za-z][a-zA-Z0-9]*)+$/`
   (catches `User_Model`).
7. **Migrate the output contract** from deprecated `{"decision":"block","reason":…}`
   to the current documented PreToolUse form (exit 0):
   `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":<suggestion>}}`
8. **Actionable escape hatch** — append to the suggestion text:
   `If the LSP tool is unavailable for this file type or returned no results, re-run this exact Grep with the pattern wrapped in double quotes ("pattern") to bypass this guard.`
   (Quoted patterns hit the string-literal allow rule — a test must cover this.)

**Tests** (`tests/lsp-first-guard.test.mjs`; spawn the hook with `child_process`,
pipe stdin JSON `{"tool_name":"Grep","tool_input":{…}}`, assert stdout/exit code):

- BLOCK (deny JSON emitted): `handleSubmit`, `getUserData\b`, `fetchData\(`,
  `UserService`, `fetch_user_data`, `fetch_failed_rows`, `handleError`,
  `ErrorBoundary`, `ValidationException`, `this.handleSubmit`, `React.Component`,
  `User_Model`, `warnUser`, `NoteEditor`, `@Component`, `class UserService`, and
  `handleSubmit` with `"path":"/x/work.log-analyzer/src"`.
- PASS (exit 0, no stdout): `TODO`, `FIXME:`, `"handleSubmit"` (quoted — escape
  hatch), `MAX_RETRIES`, `foo.bar-baz`, `server.port`, `db`, `Failed to connect`,
  `error: connection refused`, `handleSubmit` with `"glob":"*.md"`, `handleSubmit`
  with `"path":"config/settings.json"`, `https://example.com`, `1.2.3`,
  `import React`, `.btn-primary`.
- FAIL-OPEN: `tool_name:"Bash"` → exit 0; empty stdin → exit 0; garbage stdin → exit 0.
- Shape: the deny JSON has exactly `hookSpecificOutput.permissionDecision === "deny"`,
  `hookSpecificOutput.hookEventName === "PreToolUse"`, and the reason contains the
  escape-hatch sentence. No top-level `decision` key remains.

# Task 2: Back-port enabledPlugins drift + enable adversarial-agents in the settings source

**Files:** `private_dot_claude/settings.json`.

In `enabledPlugins`, immediately after the `"adr@jasonm4130-claude-skills"` entry,
add BOTH:

- `"ship-gate@jasonm4130-claude-skills": true` — matches live
  `~/.claude/settings.json` (the only live-vs-source drift; a `chezmoi apply`
  without this would silently disable ship-gate).
- `"adversarial-agents@jasonm4130-claude-skills": true` — user decision
  2026-07-09: enable it as user-invoked (its SKILL.md already sets
  `disable-model-invocation: true`, so enabling only restores the slash command).

Verify the file still parses:
`node -e "JSON.parse(require('fs').readFileSync('private_dot_claude/settings.json','utf8'))"`.

# Task 3: Add TypeScript to mise tools

**Files:** `dot_config/mise/config.toml`.

In `[tools]`, after the `"npm:pyright"` line, add:

```toml
"npm:typescript"                 = "latest"   # tsserver — typescript-language-server fails to initialize without it (LSP audit 2026-07-09)
```

Do NOT run `mise install` (post-merge controller step). Verify the TOML parses,
e.g. `python3 -c "import tomllib;tomllib.load(open('dot_config/mise/config.toml','rb'))"`.
