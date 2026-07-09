import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'private_dot_claude', 'hooks', 'lsp-first-guard.js');

/** Spawn the hook with the given stdin payload (object gets JSON-stringified, string passed as-is). */
function runHook(stdinPayload) {
  const input = typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload);
  return spawnSync(process.execPath, [HOOK_PATH], { input, encoding: 'utf8' });
}

function runGrep(pattern, extraToolInput = {}) {
  return runHook({ tool_name: 'Grep', tool_input: { pattern, ...extraToolInput } });
}

// --- BLOCK matrix: guard must deny with hookSpecificOutput JSON ---
const BLOCK_CASES = [
  ['handleSubmit', 'handleSubmit', {}],
  ['getUserData\\b (normalized trailing \\b)', 'getUserData\\b', {}],
  ['fetchData\\( (normalized escaped paren)', 'fetchData\\(', {}],
  ['UserService', 'UserService', {}],
  ['fetch_user_data', 'fetch_user_data', {}],
  ['fetch_failed_rows (message-like error rule)', 'fetch_failed_rows', {}],
  ['handleError (message-like error rule)', 'handleError', {}],
  ['ErrorBoundary (message-like error rule)', 'ErrorBoundary', {}],
  ['ValidationException (message-like error rule)', 'ValidationException', {}],
  ['this.handleSubmit (mixed-case dotted)', 'this.handleSubmit', {}],
  ['React.Component (mixed-case dotted)', 'React.Component', {}],
  ['User_Model (Pascal_Snake)', 'User_Model', {}],
  ['warnUser (case-sensitive TODO prefix)', 'warnUser', {}],
  ['NoteEditor (case-sensitive TODO prefix)', 'NoteEditor', {}],
  ['@Component', '@Component', {}],
  ['class UserService', 'class UserService', {}],
  ['handleSubmit w/ path /x/work.log-analyzer/src (end-anchored ext)', 'handleSubmit', { path: '/x/work.log-analyzer/src' }],
];

for (const [label, pattern, extraToolInput] of BLOCK_CASES) {
  test(`blocks: ${label}`, () => {
    const result = runGrep(pattern, extraToolInput);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.ok(result.stdout.trim().length > 0, 'expected deny JSON on stdout, got none');
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.hookSpecificOutput?.permissionDecision, 'deny');
  });
}

// --- PASS matrix: guard must let the Grep through silently ---
const PASS_CASES = [
  ['TODO', 'TODO', {}],
  ['FIXME:', 'FIXME:', {}],
  ['quoted "handleSubmit" (string-literal allow rule)', '"handleSubmit"', {}],
  ['handleSubmit(?:) (escape hatch)', 'handleSubmit(?:)', {}],
  ['fetchData\\((?:) (escape hatch on function-call pattern)', 'fetchData\\((?:)', {}],
  ['MAX_RETRIES', 'MAX_RETRIES', {}],
  ['foo.bar-baz', 'foo.bar-baz', {}],
  ['server.port', 'server.port', {}],
  ['db', 'db', {}],
  ['Failed to connect', 'Failed to connect', {}],
  ['error: connection refused', 'error: connection refused', {}],
  ['handleSubmit w/ glob *.md', 'handleSubmit', { glob: '*.md' }],
  ['handleSubmit w/ path config/settings.json', 'handleSubmit', { path: 'config/settings.json' }],
  ['https://example.com', 'https://example.com', {}],
  ['1.2.3', '1.2.3', {}],
  ['import React', 'import React', {}],
  ['.btn-primary', '.btn-primary', {}],
];

for (const [label, pattern, extraToolInput] of PASS_CASES) {
  test(`passes: ${label}`, () => {
    const result = runGrep(pattern, extraToolInput);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.equal(result.stdout.trim(), '', 'expected no stdout');
  });
}

// --- FAIL-OPEN: never block on non-Grep tools or malformed input ---
test('fail-open: tool_name Bash exits 0 with no output', () => {
  const result = runHook({ tool_name: 'Bash', tool_input: { command: 'handleSubmit' } });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

test('fail-open: empty stdin exits 0 with no output', () => {
  const result = runHook('');
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

test('fail-open: garbage stdin exits 0 with no output', () => {
  const result = runHook('not { valid json');
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

// --- Output shape: current PreToolUse permissionDecision contract only ---
test('deny JSON shape matches PreToolUse permissionDecision contract with escape hatch', () => {
  const result = runGrep('handleSubmit');
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.ok(
    parsed.hookSpecificOutput.permissionDecisionReason.includes(
      "If the LSP tool is unavailable for this file type or returned no results, re-run this exact Grep with (?:) appended to the end of the pattern (pattern(?:)) to bypass this guard — that's a zero-width match, so it doesn't change what Grep actually searches for."
    ),
    'expected escape-hatch sentence in permissionDecisionReason'
  );
  assert.equal('decision' in parsed, false, 'no top-level decision key should remain');
});
