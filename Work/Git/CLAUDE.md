# Code Work (`~/Work/Git/**`)

Guidance that applies when working in any of Jason's code repos. Loaded lazily by Claude Code when a session works in this tree.

## LSP-First Code Navigation

When working in code files (TS, JS, Python, Rust, Go, etc.):

1. Use LSP `goToDefinition` instead of grepping for function/class definitions
2. Use LSP `findReferences` instead of grepping for symbol usages
3. Use LSP `hover` to check types instead of reading entire files
4. Use LSP `documentSymbol` to understand file structure
5. Only use Grep for: text searches, TODOs, string literals, log messages, config values
6. Only fall back to Grep when LSP returns empty results or is unavailable

The `lsp-first-guard.js` PreToolUse hook enforces this for Grep calls that look like code-symbol lookups; it doesn't replace the rule, just catches misses.
