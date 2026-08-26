#!/usr/bin/env node

/**
 * Secrets Scan Hook
 *
 * PreToolUse hook that intercepts Edit/Write/MultiEdit/NotebookEdit/Bash
 * calls and blocks if the new content contains common secret patterns (API
 * keys, tokens, private keys). Pattern matches the lsp-first-guard.js style.
 * Bash is scanned because a heredoc or redirect writes a file without the
 * write tools ever being involved.
 *
 * Prevents the leaked-key horror stories where an agent accidentally writes
 * a real API key into a tracked file (the kind of mistake that costs $200 or
 * $6,000 by morning, depending on which provider's quota gets burned).
 *
 * False positives are intentional: cost of asking ≪ cost of a leaked key.
 *
 * This is a PROTECTION hook, so it fails CLOSED: if stdin can't be read,
 * the payload can't be parsed, or the scan itself throws, the write is
 * denied rather than silently unscanned. A swallowed error here would mean
 * the guard stops protecting without anyone noticing. Advisory hooks
 * (lsp-first-guard, tab-title) keep failing open; this one must not.
 *
 * Denials use the current PreToolUse contract (exit 0 +
 * hookSpecificOutput.permissionDecision) — the older top-level
 * `decision: "block"` field is deprecated, and exit-code-2 blocking is
 * unreliable for Edit/Write tool calls.
 *
 * Stdin is read async, not via readFileSync('/dev/stdin'): the sync read
 * intermittently throws EAGAIN on Linux when stdin is a non-blocking pipe.
 */

/** Emit a deny in the current PreToolUse contract and exit 0. */
function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

let rawStdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawStdin += chunk; });
process.stdin.on('error', () => deny('SECRETS-SCAN: could not read hook input — failing closed (write blocked because it could not be scanned). Re-run the edit; if this persists, check ~/.claude/hooks/secrets-scan.js.'));
process.stdin.on('end', () => {
  try {
    main(rawStdin);
  } catch (err) {
    deny(`SECRETS-SCAN: internal error while scanning — failing closed (write blocked because it could not be scanned). Error: ${err?.message ?? err}`);
  }
});

function main(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    deny('SECRETS-SCAN: could not parse hook input JSON — failing closed (write blocked because it could not be scanned).');
  }
  if (input === null || typeof input !== 'object') {
    deny('SECRETS-SCAN: hook input was not an object — failing closed (write blocked because it could not be scanned).');
  }

  const { tool_name, tool_input } = input;

  if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'].includes(tool_name)) {
    process.exit(0);
  }

  let content = '';
  if (tool_name === 'Write') {
    content = tool_input?.content || '';
  } else if (tool_name === 'Edit') {
    content = tool_input?.new_string || '';
  } else if (tool_name === 'MultiEdit') {
    const edits = tool_input?.edits || [];
    content = edits.map(e => e.new_string || '').join('\n');
  } else if (tool_name === 'NotebookEdit') {
    content = tool_input?.new_source || '';
  } else if (tool_name === 'Bash') {
    // A heredoc/redirect through Bash writes a file without touching the write
    // tools, so the command line gets the same scan as file content.
    content = tool_input?.command || '';
  }

  if (!content) {
    process.exit(0);
  }

  // High-confidence secret patterns. Tuned to minimise false positives while
  // still catching the obvious ones. Keep this list focused — every false
  // positive is friction, every miss is a potential leak.
  const secretPatterns = [
    { name: 'Anthropic API key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
    { name: 'OpenAI API key',    regex: /\bsk-[a-zA-Z0-9]{32,}\b/ },
    { name: 'AWS access key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: 'AWS secret-key assignment', regex: /AWS_SECRET_ACCESS_KEY\s*[=:]\s*["']?[a-zA-Z0-9/+]{30,}["']?/ },
    { name: 'GitHub token',      regex: /\bgh[pousr]_[a-zA-Z0-9]{30,}\b/ },
    { name: 'Stripe key',        regex: /\bsk_(?:live|test)_[a-zA-Z0-9]{20,}\b/ },
    { name: 'Buffer token assignment', regex: /BUFFER_TOKEN\s*[=:]\s*["']?[a-zA-Z0-9_.\-]{20,}["']?/ },
    { name: 'Slack token',       regex: /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/ },
    { name: 'Private key header', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/ },
    { name: 'Cloudflare API token (long URL-safe assignment)', regex: /CF(?:_API)?_TOKEN\s*[=:]\s*["']?[a-zA-Z0-9_-]{30,}["']?/ },
  ];

  const matches = secretPatterns.filter(p => p.regex.test(content));

  if (matches.length === 0) {
    process.exit(0);
  }

  const reason = `SECRETS-SCAN: Detected potential secret(s) in tool input — blocking the write.

Matches: ${matches.map(m => m.name).join(', ')}

If this is intentional (editing a gitignored .env, an encrypted fixture, or a placeholder example), bypass by:
- Replacing the real value with a placeholder like \`sk-ant-XXX\` or \`<REDACTED>\`
- Confirming with the user before re-running
- Editing the file directly outside Claude Code

False positives are intentional. The cost of asking is much lower than the cost of a leaked key.`;

  deny(reason);
}
