import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'private_dot_claude', 'hooks', 'executable_secrets-scan.js');

// Fixture secrets are assembled at runtime from fragments so this test file's
// own content never contains a contiguous secret pattern — otherwise the very
// hook under test blocks edits to this file (verified: it does).
const FAKE_ANTHROPIC = ['sk-ant', 'api03', 'abcdefghijklmnopqrstuvwx'].join('-');
const FAKE_GITHUB = 'ghp' + '_' + 'abcdefghijklmnopqrstuvwxyz0123456789';
const FAKE_PEM_HEADER = ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ');

/** Spawn the hook with the given stdin payload (object gets JSON-stringified, string passed as-is). */
function runHook(stdinPayload) {
  const input = typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload);
  return spawnSync(process.execPath, [HOOK_PATH], { input, encoding: 'utf8' });
}

/** Parse a deny response; asserts the modern PreToolUse contract shape. */
function expectDeny(res, reasonSubstring) {
  assert.equal(res.status, 0, `expected exit 0 (JSON contract), got ${res.status}`);
  const out = JSON.parse(res.stdout);
  assert.equal(out.hookSpecificOutput?.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  if (reasonSubstring) {
    assert.ok(
      out.hookSpecificOutput.permissionDecisionReason.includes(reasonSubstring),
      `reason should mention "${reasonSubstring}"`,
    );
  }
  return out;
}

// --- Allow paths ---

test('non-covered tool → allow (exit 0, no output)', () => {
  const res = runHook({ tool_name: 'Glob', tool_input: { pattern: `**/${FAKE_ANTHROPIC}` } });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('Write with clean content → allow', () => {
  const res = runHook({ tool_name: 'Write', tool_input: { content: 'const x = 1;\n' } });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('Write with empty content → allow', () => {
  const res = runHook({ tool_name: 'Write', tool_input: {} });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('placeholder-style key (too short) → allow', () => {
  const res = runHook({ tool_name: 'Write', tool_input: { content: 'ANTHROPIC_API_KEY=sk-ant-XXX' } });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

// --- Deny paths: modern hookSpecificOutput.permissionDecision contract ---

test('Write with Anthropic key → deny via permissionDecision JSON', () => {
  const res = runHook({
    tool_name: 'Write',
    tool_input: { content: `const key = "${FAKE_ANTHROPIC}";` },
  });
  expectDeny(res, 'Anthropic API key');
});

test('Edit new_string with GitHub token → deny', () => {
  const res = runHook({
    tool_name: 'Edit',
    tool_input: { new_string: `token = "${FAKE_GITHUB}"` },
  });
  expectDeny(res, 'GitHub token');
});

test('MultiEdit with secret in one edit → deny', () => {
  const res = runHook({
    tool_name: 'MultiEdit',
    tool_input: {
      edits: [
        { new_string: 'harmless' },
        { new_string: FAKE_PEM_HEADER },
      ],
    },
  });
  expectDeny(res, 'Private key header');
});

test('Bash command with secret → deny', () => {
  const res = runHook({ tool_name: 'Bash', tool_input: { command: `echo ${FAKE_ANTHROPIC} > .env` } });
  expectDeny(res, 'Anthropic API key');
});

test('Bash clean command → allow', () => {
  const res = runHook({ tool_name: 'Bash', tool_input: { command: 'git status' } });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

// --- Fail-closed: protection hook blocks when it cannot verify safety ---

test('malformed JSON stdin → deny (fail closed), not silent allow', () => {
  const res = runHook('{not valid json');
  expectDeny(res, 'fail');
});

test('non-object JSON stdin → deny (fail closed)', () => {
  const res = runHook('null');
  expectDeny(res, 'fail');
});
