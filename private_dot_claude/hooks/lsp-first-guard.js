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

const pattern = tool_input?.pattern || '';

// Allow list — patterns that are clearly not code symbol lookups
const allowPatterns = [
  // Short patterns (likely text search)
  /^.{1,3}$/,
  // TODO/FIXME/HACK comments
  /^(TODO|FIXME|HACK|NOTE|XXX|WARN)/i,
  // String literals / log messages
  /^["'].*["']$/,
  // File paths and extensions
  /\.\w{1,4}$/,
  // Config keys (dot-separated, kebab-case with dots)
  /^[\w-]+\.[\w-]+/,
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
  // Error messages
  /error|warning|failed|exception/i,
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
  if (ap.test(pattern)) {
    process.exit(0);
  }
}

// Check if it looks like a code symbol
let isCodeSymbol = false;
for (const cp of codeSymbolPatterns) {
  if (cp.test(pattern)) {
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

Only use Grep if LSP returns no results or you're searching non-code files.`;

// Output the block message as JSON
console.log(JSON.stringify({
  decision: "block",
  reason: suggestion
}));
