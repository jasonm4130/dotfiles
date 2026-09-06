import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const herdr = fileURLToPath(new URL('../dot_codex/executable_herdr-agent-state.sh', import.meta.url));
const guard = fileURLToPath(new URL('../private_dot_claude/hooks/executable_claude-md-guard.sh', import.meta.url));
function run(script, arg, payload, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = execFile('bash', [script, arg], { env, timeout: 5000 }, (error, stdout) => {
      error ? reject(error) : resolve(stdout);
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

test('Codex apply_patch receives the instruction-size advisory', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-advisory-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'MEMORY.md'), 'x'.repeat(300) + '\n' + 'oversized\n'.repeat(3000));
  const output = JSON.parse(await run(guard, 'codex-hook', {
    cwd: dir, tool_name: 'apply_patch',
    tool_input: { command: '*** Begin Patch\n*** Update File: MEMORY.md\n@@\n+note\n*** End Patch' },
  }));
  assert.match(output.hookSpecificOutput.additionalContext, /local review threshold/);
  assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /TRUNCATED|NOT loaded|cap bites/);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PostToolUse');
});

test('native Herdr Codex hook reports the correct session to a local socket', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-herdr-'));
  const socket = join(dir, 'test.sock');
  const server = createServer();
  t.after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });
  const received = new Promise(resolve => server.on('connection', client => {
    let data = '';
    client.on('data', chunk => {
      data += chunk;
      if (data.includes('\n')) { resolve(JSON.parse(data)); client.end('{}\n'); }
    });
  }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
  const env = { ...process.env, HERDR_ENV: '1', HERDR_SOCKET_PATH: socket, HERDR_PANE_ID: 'test-pane' };
  delete env.CODEX_THREAD_ID;
  await run(herdr, 'session', {
    hook_event_name: 'SessionStart', session_id: 'test-session',
    transcript_path: join(dir, 'transcript.jsonl'), source: 'startup',
  }, env);
  const message = await Promise.race([received, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Herdr report was not received')), 1000);
    timer.unref();
  })]);
  assert.equal(message.method, 'pane.report_agent_session');
  assert.equal(message.params.agent, 'codex');
  assert.equal(message.params.agent_session_id, 'test-session');
  assert.equal(message.params.pane_id, 'test-pane');
});

test('native Herdr hook is silent outside Herdr', async () => {
  assert.equal(await run(herdr, 'session', {}, { ...process.env, HERDR_ENV: '0' }), '');
});
