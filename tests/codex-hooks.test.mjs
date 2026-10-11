import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const herdr = fileURLToPath(new URL('../dot_codex/executable_herdr-agent-state.sh', import.meta.url));
function run(script, arg, payload, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = execFile('bash', [script, arg], { env, timeout: 5000 }, (error, stdout) => {
      error ? reject(error) : resolve(stdout);
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

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

// The unattended guard runs the fleet profile's guards against Codex payloads, only when no
// person can answer an approval. Its guards are installed into a fixture HOME from this checkout;
// claude-hooks is a stub because CI does not build the Go binary here.
const guard = fileURLToPath(new URL('../dot_codex/hooks/executable_unattended-guard.sh', import.meta.url));
function guardHome(t, { secrets = true } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'codex-guard-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const install = (from, to) => {
    mkdirSync(dirname(join(home, to)), { recursive: true });
    copyFileSync(fileURLToPath(new URL(`../${from}`, import.meta.url)), join(home, to));
    chmodSync(join(home, to), 0o755);
  };
  install('private_dot_claude-fm-workers/hooks/executable_homelab-guard.sh', '.claude-fm-workers/hooks/homelab-guard.sh');
  install('private_dot_claude-fm-workers/hooks/executable_docs-sync-plugins-only.sh', '.claude-fm-workers/hooks/docs-sync-plugins-only.sh');
  install('private_dot_claude/hooks/executable_disk-guard.sh', '.claude/hooks/disk-guard.sh');
  if (secrets) {
    mkdirSync(join(home, '.local/bin'), { recursive: true });
    writeFileSync(join(home, '.local/bin/claude-hooks'), `#!/bin/sh
grep -q FIXTURE-SECRET && printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"SECRETS-SCAN stub"}}'
exit 0
`, { mode: 0o755 });
  }
  return payload => spawnSync('bash', [guard], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home },
  });
}
const bash = (command, permission_mode = 'bypassPermissions') => ({ tool_name: 'Bash', permission_mode, cwd: tmpdir(), tool_input: { command } });

test('unattended guard leaves interactive Codex sessions alone', t => {
  const r = guardHome(t)(bash('curl http://192.168.5.10:8080/', 'default'));
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, '');
});

test('unattended guard refuses a homelab network command under approval_policy=never', t => {
  const r = guardHome(t)(bash('curl -s http://brok.jasonmatthew.me/api'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /homelab-guard/);
});

test('unattended guard fails closed when permission_mode is missing', t => {
  const { permission_mode, ...payload } = bash('ssh brok uptime');
  const r = guardHome(t)(payload);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /homelab-guard/);
});

test('unattended guard passes a secrets-scan deny through for apply_patch and allows clean work', t => {
  const run = guardHome(t);
  const denied = run({ tool_name: 'apply_patch', permission_mode: 'bypassPermissions', tool_input: { command: '*** Begin Patch\n+FIXTURE-SECRET\n*** End Patch' } });
  assert.equal(denied.status, 0);
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const clean = run(bash('git status'));
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout + clean.stderr, '');
});

test('unattended guard blocks when a fail-closed guard is missing', t => {
  const r = guardHome(t, { secrets: false })(bash('git status'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /claude-hooks is missing/);
});

// Codex itself validates each rule's match/not_match examples when it parses the file.
test('unattended rules parse and split homelab, merge and apply from routine commands', { skip: spawnSync('codex', ['--version']).status !== 0 && 'codex CLI not installed' }, () => {
  const rules = fileURLToPath(new URL('../dot_codex/rules/unattended.rules', import.meta.url));
  const decision = (...cmd) => JSON.parse(execFileSync('codex', ['execpolicy', 'check', '--resolve-host-executables', '-r', rules, ...cmd], { encoding: 'utf8' })).decision;
  for (const cmd of [['ssh', 'brok', 'uptime'], ['/usr/bin/scp', 'f', 'root@192.168.5.10:/tmp/'], ['ansible-playbook', 'site.yml'], ['gh', 'pr', 'merge', '1'], ['chezmoi', 'apply', '/x']]) {
    assert.equal(decision(...cmd), 'prompt', cmd.join(' '));
  }
  for (const cmd of [['git', 'status'], ['gh', 'pr', 'view', '1'], ['chezmoi', 'diff'], ['ssh-keygen', '-l']]) {
    assert.equal(decision(...cmd), undefined, cmd.join(' '));
  }
});
