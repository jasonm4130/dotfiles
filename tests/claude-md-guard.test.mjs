/**
 * claude-md-guard.sh `hook` mode is a PostToolUse advisory. It must exit 0
 * unconditionally and never block, and it must surface findings through
 * hookSpecificOutput.additionalContext — plain stdout is discarded by the
 * harness. Bash payloads are covered because a heredoc or `sed -i` rewrites an
 * always-loaded instruction file without the write tools being involved.
 *
 * Only `hook` mode is exercised here; sweep/file/drift read the real machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hook = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../private_dot_claude/hooks/executable_claude-md-guard.sh',
);

/** Run `hook` mode with `stdin`, resolving to {code, stdout}. */
function run(stdin) {
  return new Promise((resolve) => {
    const child = execFile('bash', [hook, 'hook'], (err, stdout) => {
      resolve({ code: err?.code ?? 0, stdout: stdout ?? '' });
    });
    child.stdin.end(stdin);
  });
}

/** An oversized MEMORY.md — past the hard 25600B cap, so it always has findings. */
function oversizedMemory(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cmg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = path.join(dir, 'MEMORY.md');
  writeFileSync(p, `${'x'.repeat(300)}\n`.repeat(100));
  return p;
}

test('an Edit payload on an oversized MEMORY.md still emits additionalContext', async (t) => {
  const p = oversizedMemory(t);
  const { code, stdout } = await run(
    JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: p } }),
  );
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /TRUNCATED/);
  assert.ok(out.hookSpecificOutput.additionalContext.includes(p));
});

test('a Bash payload naming that same MEMORY.md emits equivalent additionalContext', async (t) => {
  const p = oversizedMemory(t);
  const edit = JSON.parse(
    (await run(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: p } }))).stdout,
  );
  const { code, stdout } = await run(
    JSON.stringify({ tool_name: 'Bash', tool_input: { command: `sed -i '' s/x/y/ ${p}` } }),
  );
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), edit);
});

test('a Bash payload with a cwd-relative guarded path is resolved', async (t) => {
  const p = oversizedMemory(t);
  const { code, stdout } = await run(
    JSON.stringify({
      tool_name: 'Bash',
      cwd: path.dirname(p),
      tool_input: { command: 'cat > MEMORY.md <<EOF' },
    }),
  );
  assert.equal(code, 0);
  assert.ok(JSON.parse(stdout).hookSpecificOutput.additionalContext.includes(p));
});

test('a Bash payload naming an unguarded file emits nothing', async () => {
  const { code, stdout } = await run(
    JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status --short' } }),
  );
  assert.equal(code, 0);
  assert.equal(stdout, '');
});

test('hook mode exits 0 on unusable input', async () => {
  for (const stdin of ['', 'not json at all', '{}', '{"tool_input":{}}']) {
    const { code } = await run(stdin);
    assert.equal(code, 0, `stdin ${JSON.stringify(stdin)} must not wedge the session`);
  }
});
