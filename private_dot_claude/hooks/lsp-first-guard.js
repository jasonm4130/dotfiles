#!/usr/bin/env node

/**
 * LSP-First Guard Hook
 *
 * PreToolUse hook that intercepts Grep calls searching for code symbols
 * and suggests LSP alternatives instead. Allows through text/config searches.
 */

const input = (() => {
  try {
    return JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  } catch {
    process.exit(0);
  }
})();

const { tool_name, tool_input } = input;

// Only intercept Grep calls
if (tool_name !== 'Grep') {
  process.exit(0);
}

// The actual pattern as passed to the tool — used verbatim in output. The
// tool call itself is never altered by this hook.
const pattern = tool_input?.pattern || '';

// Normalize for classification only: strip one trailing `\b` word-boundary
// anchor and unescape `\(`/`\)`, so e.g. `getUserData\b` and `fetchData\(`
// classify the same as their bare forms `getUserData` / `fetchData(`.
const classifyPattern = pattern
  .replace(/\\b$/, '')
  .replace(/\\\(/g, '(')
  .replace(/\\\)/g, ')');

// File-scope allow: if the search explicitly targets non-code files
// (config/data/docs), LSP can't index them — let snake_case keys etc. through.
// glob and path are checked separately, each end-anchored, so a code-looking
// substring elsewhere in the path (e.g. `work.log-analyzer/src`) can't
// disable the guard.
const nonCodeExt = /\.(json|ya?ml|toml|sh|bash|zsh|md|markdown|txt|env|plist|conf|ini|cfg|lock|log|csv|tsv)$/i;
const nonCodeType = /^(json|yaml|md|markdown|sh|bash|toml|config|txt|csv|log)$/i;
if (
  nonCodeExt.test(tool_input?.glob || '') ||
  nonCodeExt.test(tool_input?.path || '') ||
  nonCodeType.test(tool_input?.type || '')
) {
  process.exit(0);
}

// Allow list — patterns that are clearly not code symbol lookups
const allowPatterns = [
  // Short patterns (likely text search)
  /^.{1,3}$/,
  // TODO/FIXME/HACK comments — case-sensitive, word boundary (so `warnUser`,
  // `NoteEditor` don't slip through as `WARN`/`NOTE`)
  /^(TODO|FIXME|HACK|NOTE|XXX|WARN)\b/,
  // String literals / log messages
  /^["'].*["']$/,
  // Escape hatch — deliberate: append `(?:)` (an empty non-capturing group)
  // to the end of the original pattern to bypass this guard when LSP can't
  // help. `(?:)` matches the empty string, so it's a zero-width no-op that
  // doesn't change what Grep actually matches — unlike wrapping the pattern
  // in quotes (which searches for the literal quoted string instead of the
  // identifier and silently returns nothing). Verified empirically: `rg
  // 'handleSubmit'` and `rg 'handleSubmit(?:)'` return identical matches;
  // `rg '"handleSubmit"'` returns none.
  /\(\?:\)$/,
  // File paths and extensions
  /\.\w{1,4}$/,
  // Config keys — all-lowercase dotted form only. Mixed-case dotted patterns
  // (`this.handleSubmit`, `React.Component`) fall through to the method-call
  // block rule below instead.
  /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/,
  // Import/require/from statements
  /^(import|require|from)\s/,
  // CSS classes / HTML attributes
  /^[\.\#][\w-]+/,
  // Regex-heavy patterns (user is doing a real regex search)
  /[\\()\[\]{}|+?*]{3,}/,
  // Environment variables
  /^[A-Z][A-Z0-9_]{2,}$/,
  // URLs and paths
  /^(https?:|\/|\.\.\/)/,
  // Error messages — message-like only (a word followed by whitespace/colon),
  // not bare identifiers like `handleError` or `ErrorBoundary`
  /\b(error|warning|failed|exception)\b[\s:]/i,
  // Version strings
  /^\d+\.\d+/,
];

// Check if pattern looks like a code symbol
const codeSymbolPatterns = [
  // camelCase: starts lowercase, has uppercase later
  /^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/,
  // PascalCase: starts uppercase, mixed case
  /^[A-Z][a-z]+[A-Z][a-zA-Z0-9]*$/,
  // snake_case with multiple segments
  /^[a-z][a-z0-9]*(_[a-z][a-z0-9]*){1,}$/,
  // Pascal_Snake: e.g. `User_Model`
  /^[A-Z][a-zA-Z0-9]*(_[A-Za-z][a-zA-Z0-9]*)+$/,
  // Class/type patterns: starts with uppercase, 4+ chars
  /^[A-Z][a-zA-Z0-9]{3,}$/,
  // Function call pattern
  /^[a-zA-Z_]\w*\s*\(/,
  // Method pattern: word.word
  /^[a-zA-Z_]\w*\.[a-zA-Z_]\w*$/,
  // Decorator/annotation
  /^@[a-zA-Z]/,
  // Type annotation patterns
  /^(class|interface|type|enum|struct|trait|fn|def|function|const|let|var)\s+\w+/,
];

// If it matches an allow pattern, let it through
for (const ap of allowPatterns) {
  if (ap.test(classifyPattern)) {
    process.exit(0);
  }
}

// Check if it looks like a code symbol
let isCodeSymbol = false;
for (const cp of codeSymbolPatterns) {
  if (cp.test(classifyPattern)) {
    isCodeSymbol = true;
    break;
  }
}

if (!isCodeSymbol) {
  // Not a code symbol pattern, allow the grep
  process.exit(0);
}

// Block the grep and suggest LSP
const suggestion = `LSP-FIRST: "${pattern}" looks like a code symbol. Use the LSP tool instead:
- To find where it's defined: LSP goToDefinition
- To find all usages: LSP findReferences
- To check its type: LSP hover
- To list symbols in a file: LSP documentSymbol

Only use Grep if LSP returns no results or you're searching non-code files.

If the LSP tool is unavailable for this file type or returned no results, re-run this exact Grep with (?:) appended to the end of the pattern (pattern(?:)) to bypass this guard — that's a zero-width match, so it doesn't change what Grep actually searches for.`;

// Output the deny decision in the current PreToolUse hookSpecificOutput contract
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: suggestion,
  }
}));
process.exit(0);
