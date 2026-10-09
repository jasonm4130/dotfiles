/**
 * Guards the ships-log phase 2 Mac side: the SessionStart tag hook, the 1Password
 * client-certificate installer, and the rendered shipper config, LaunchAgent gate
 * and .chezmoiignore rule. Everything runs against a throwaway HOME, a stub `op`
 * and fixture PEM text, so nothing reads 1Password, real transcripts or launchd.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(repoRoot, 'private_dot_claude/hooks/executable_ships-log-session-tag.py');
const INSTALL = path.join(repoRoot, 'dot_local/bin/executable_ships-log-install-cert');

// Fixture PEM armour around a non-key body. The key label is assembled at run
// time so secret scanners do not read this file as holding a key.
const pem = (label) => `-----BEGIN ${label}-----\nZml4dHVyZQ==\n-----END ${label}-----\n`;
const KEY_LABEL = ['PRIVATE', 'KEY'].join(' ');
const FAKE_CERT = pem('CERTIFICATE');
const FAKE_KEY = pem(KEY_LABEL);

function sandbox(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ships-log-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const mode = (p) => statSync(p).mode & 0o777;

// --- SessionStart tag hook -------------------------------------------------

function runHook(dir, input, env = {}) {
  const { FM_TASK_ID: _t, FM_HOME: _h, FM_TASK_INBOX: _i, CLAUDE_CONFIG_DIR: _c, ...base } = process.env;
  return spawnSync('python3', [HOOK], { input, encoding: 'utf8',
    env: { ...base, SHIPS_LOG_STATE_DIR: path.join(dir, 'state'), ...env } });
}

test('hook writes a SessionTag-shaped file and prints nothing', (t) => {
  const dir = sandbox(t);
  const id = '0b5c2f3e-1111-4222-8333-944455556666';
  const result = runHook(dir, JSON.stringify({ session_id: id, cwd: '/tmp/project', hook_event_name: 'SessionStart' }),
    { FM_TASK_ID: 'sl-p2-mac-shipper', FM_HOME: '/fm/home/', CLAUDE_CONFIG_DIR: '/cfg/claude-fm-workers' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', 'SessionStart stdout becomes model context');
  const tagsDir = path.join(dir, 'state', 'sessions');
  assert.deepEqual(readdirSync(tagsDir), [`${id}.json`], 'no temp file left behind');
  const tag = JSON.parse(readFileSync(path.join(tagsDir, `${id}.json`), 'utf8'));
  assert.deepEqual(Object.keys(tag).sort(), ['config_root', 'cwd', 'fm_home', 'fm_task_id', 'host', 'session_id', 'ts', 'v']);
  assert.equal(tag.v, 1);
  assert.equal(tag.session_id, id);
  assert.equal(tag.fm_task_id, 'sl-p2-mac-shipper');
  assert.equal(tag.cwd, '/tmp/project');
  assert.equal(tag.host, 'mac', 'the ships-log host id, not the machine name');
  assert.equal(tag.fm_home, '/fm/home');
  assert.equal(tag.config_root, '/cfg/claude-fm-workers');
  assert.match(tag.ts, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(mode(tagsDir), 0o700);
});

test('hook writes a null fm_task_id outside Firstmate', (t) => {
  const dir = sandbox(t);
  const result = runHook(dir, JSON.stringify({ session_id: 'abc-123', cwd: '/tmp' }));
  assert.equal(result.status, 0, result.stderr);
  const tag = JSON.parse(readFileSync(path.join(dir, 'state', 'sessions', 'abc-123.json'), 'utf8'));
  assert.equal(tag.fm_task_id, null);
  assert.equal(tag.fm_home, null);
  assert.equal(tag.config_root, path.join(os.homedir(), '.claude'));
});

test('hook derives fm_home from FM_TASK_INBOX when FM_HOME is unset', (t) => {
  const dir = sandbox(t);
  const read = (id) => JSON.parse(readFileSync(path.join(dir, 'state', 'sessions', `${id}.json`), 'utf8'));
  runHook(dir, JSON.stringify({ session_id: 'inbox-1', cwd: '/tmp' }),
    { FM_TASK_ID: 'x', FM_TASK_INBOX: '/h/firstmate/state/x.inbox' });
  assert.equal(read('inbox-1').fm_home, '/h/firstmate');
  runHook(dir, JSON.stringify({ session_id: 'inbox-2', cwd: '/tmp' }),
    { FM_TASK_ID: 'x', FM_TASK_INBOX: '/h/firstmate/elsewhere/x.inbox' });
  assert.equal(read('inbox-2').fm_home, null, 'an inbox outside <home>/state names no home');
  runHook(dir, JSON.stringify({ session_id: 'inbox-3', cwd: '/tmp' }),
    { FM_HOME: '/a', FM_TASK_INBOX: '/b/state/x.inbox' });
  assert.equal(read('inbox-3').fm_home, '/a', 'FM_HOME wins');
});

test('hook ignores unsafe session ids and bad input without failing', (t) => {
  const dir = sandbox(t);
  for (const input of [JSON.stringify({ session_id: '../escape', cwd: '/tmp' }),
    JSON.stringify({ session_id: 'a..b', cwd: '/tmp' }), JSON.stringify({ cwd: '/tmp' }), 'not json', '[]']) {
    const result = runHook(dir, input);
    assert.equal(result.status, 0, `${input}: ${result.stderr}`);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
  assert.equal(existsSync(path.join(dir, 'state', 'sessions')), false);
  assert.equal(existsSync(path.join(dir, 'escape.json')), false);
});

test('both chezmoi-managed Claude settings register the hook', () => {
  for (const rel of ['private_dot_claude/settings.json', 'private_dot_claude-fm-workers/settings.json']) {
    const settings = JSON.parse(readFileSync(path.join(repoRoot, rel), 'utf8'));
    const commands = (settings.hooks.SessionStart ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command));
    assert.ok(commands.includes('~/.claude/hooks/ships-log-session-tag.py'), `${rel} does not register the tag hook`);
  }
});

// --- client certificate installer ------------------------------------------

/** A stub `op` that serves fixture fields, or fails like a missing item. */
function opStub(dir, fields) {
  const stub = path.join(dir, 'op-stub');
  const calls = path.join(dir, 'op-calls');
  writeFileSync(stub, `#!/usr/bin/env bash
echo "$*" >> ${JSON.stringify(calls)}
[ "$1" = read ] || exit 64
case "$2" in
${Object.entries(fields).map(([ref, value], i) => {
    const file = path.join(dir, `field-${i}`);
    writeFileSync(file, value);
    return `  ${JSON.stringify(ref)}) cat ${JSON.stringify(file)} ;;`;
  }).join('\n')}
  *) echo "[ERROR] could not read secret '$2': item not found" >&2; exit 1 ;;
esac
`, { mode: 0o755 });
  return { stub, calls };
}

function runInstall(dir, args, op) {
  return spawnSync('bash', [INSTALL, ...args], { encoding: 'utf8',
    env: { ...process.env, SHIPS_LOG_CONFIG_DIR: path.join(dir, 'cfg'), SHIPS_LOG_OP_BIN: op } });
}

test('installer skips cleanly with no vault set', (t) => {
  const dir = sandbox(t);
  const { stub, calls } = opStub(dir, {});
  const result = runInstall(dir, [''], stub);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /no 1Password vault set/);
  assert.equal(existsSync(calls), false, 'op is not called without a vault');
  assert.equal(existsSync(path.join(dir, 'cfg')), false);
});

test('installer skips cleanly when the 1Password item does not exist yet', (t) => {
  const dir = sandbox(t);
  const { stub } = opStub(dir, {});
  const result = runInstall(dir, ['Infra'], stub);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /could not read op:\/\/Infra\/ships-log-client-mac\/certificate/);
  assert.deepEqual(readdirSync(path.join(dir, 'cfg')), [], 'no partial files or temp dir left');
});

test('installer writes the certificate and key as 0600 files from op read', (t) => {
  const dir = sandbox(t);
  const { stub, calls } = opStub(dir, {
    'op://Infra/ships-log-client-mac/certificate': FAKE_CERT,
    'op://Infra/ships-log-client-mac/private-key': FAKE_KEY,
  });
  const result = runInstall(dir, ['Infra'], stub);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(KEY_LABEL) && !result.stderr.includes(KEY_LABEL), 'key material is never echoed');
  const cfg = path.join(dir, 'cfg');
  assert.deepEqual(readdirSync(cfg).sort(), ['client.crt', 'client.key']);
  assert.equal(readFileSync(path.join(cfg, 'client.crt'), 'utf8'), FAKE_CERT);
  assert.equal(readFileSync(path.join(cfg, 'client.key'), 'utf8'), FAKE_KEY);
  assert.equal(mode(path.join(cfg, 'client.crt')), 0o600);
  assert.equal(mode(path.join(cfg, 'client.key')), 0o600);
  assert.equal(mode(cfg), 0o700);
  assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'),
    ['read op://Infra/ships-log-client-mac/certificate', 'read op://Infra/ships-log-client-mac/private-key']);
});

test('installer refuses a field that is not PEM and installs nothing', (t) => {
  const dir = sandbox(t);
  const { stub } = opStub(dir, {
    'op://Infra/ships-log-client-mac/certificate': 'oops',
    'op://Infra/ships-log-client-mac/private-key': FAKE_KEY,
  });
  const result = runInstall(dir, ['Infra'], stub);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a PEM certificate/);
  assert.deepEqual(readdirSync(path.join(dir, 'cfg')), []);
});

// --- rendered templates (chezmoi execute-template, isolated HOME) ----------

function render(home, file, overrides) {
  const args = ['execute-template', '--source', repoRoot];
  if (overrides) args.push('--override-data', JSON.stringify(overrides));
  return execFileSync('chezmoi', args, { input: readFileSync(path.join(repoRoot, file), 'utf8'), encoding: 'utf8',
    env: { ...process.env, HOME: home } });
}

test('shipper config renders the four Mac sources over mTLS', (t) => {
  const home = sandbox(t);
  const config = JSON.parse(render(home, 'dot_config/private_ships-log/shipper.json.tmpl'));
  assert.equal(config.ingest_url, 'https://ships-log-ingest.jasonmatthew.me:4443/api/ingest/v1');
  assert.deepEqual(config.tls, { cert: '~/.config/ships-log/client.crt', key: '~/.config/ships-log/client.key' });
  assert.deepEqual(config.sources, [
    { id: 'mac/personal', root: '~/.claude' },
    { id: 'mac/fm-workers', root: '~/.claude-fm-workers' },
    { id: 'mac/fresh', root: '~/.claude-fresh' },
    { id: 'mac/codex', root: '~/.codex/sessions' },
  ]);
  assert.equal(config.state_dir, '~/.local/state/ships-log/shipper');
  assert.equal(config.session_tags_dir, '~/.local/state/ships-log/sessions');
  assert.deepEqual(config.firstmate_homes, [path.join(home, 'Work/Git/firstmate')], 'the primary home is listed even with no treehouse homes');
});

test('shipper config pins a CA and lists Firstmate homes when present', (t) => {
  const home = sandbox(t);
  mkdirSync(path.join(home, '.treehouse/firstmate-abc/1/firstmate'), { recursive: true });
  const config = JSON.parse(render(home, 'dot_config/private_ships-log/shipper.json.tmpl', { shipsLog: { caFile: '/etc/ca.pem' } }));
  assert.equal(config.tls.ca, '/etc/ca.pem');
  assert.deepEqual(config.firstmate_homes, [path.join(home, 'Work/Git/firstmate'), path.join(home, '.treehouse/firstmate-abc/1/firstmate')]);
});

test('shipper config renders [] (not null) when no firstmate homes are configured or found', (t) => {
  const home = sandbox(t);
  const config = JSON.parse(render(home, 'dot_config/private_ships-log/shipper.json.tmpl', { shipsLog: { firstmateHomes: [] } }));
  assert.deepEqual(config.firstmate_homes, []);
});

test('cert script passes the vault, single-quoted, to the installer', (t) => {
  const home = sandbox(t);
  const empty = render(home, 'run_onchange_after_19-ships-log-client-cert.sh.tmpl', { shipsLog: { opVault: '' } });
  assert.match(empty, /ships-log-install-cert" ''$/m);
  const set = render(home, 'run_onchange_after_19-ships-log-client-cert.sh.tmpl', { shipsLog: { opVault: 'Infra' } });
  assert.match(set, /ships-log-install-cert" 'Infra'$/m);
});

test('LaunchAgent script is a no-op with a message until the binary exists', (t) => {
  const home = sandbox(t);
  const script = render(home, 'run_onchange_after_20-launchd-ships-log-shipper.sh.tmpl');
  assert.match(script, /binary=absent cert=absent/);
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ships-log shipper not loaded: .*ships-log-shipper is missing/);
});

test('LaunchAgent script waits for the client certificate after the binary', (t) => {
  const home = sandbox(t);
  mkdirSync(path.join(home, '.local/bin'), { recursive: true });
  writeFileSync(path.join(home, '.local/bin/ships-log-shipper'), '#!/bin/sh\n', { mode: 0o755 });
  const script = render(home, 'run_onchange_after_20-launchd-ships-log-shipper.sh.tmpl');
  assert.match(script, /binary=present cert=absent/, 'the binary appearing changes the script, so chezmoi re-runs it');
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no client certificate yet/);
});

test('.chezmoiignore holds the plist back until binary and certificate exist', (t) => {
  const home = sandbox(t);
  const plist = 'Library/LaunchAgents/dev.jasonmatthew.ships-log-shipper.plist';
  const ignored = () => render(home, '.chezmoiignore').split('\n').includes(plist);
  assert.equal(ignored(), true);
  mkdirSync(path.join(home, '.local/bin'), { recursive: true });
  writeFileSync(path.join(home, '.local/bin/ships-log-shipper'), '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(ignored(), true, 'binary alone is not enough');
  mkdirSync(path.join(home, '.config/ships-log'), { recursive: true });
  writeFileSync(path.join(home, '.config/ships-log/client.crt'), FAKE_CERT);
  writeFileSync(path.join(home, '.config/ships-log/client.key'), FAKE_KEY);
  assert.equal(ignored(), false);
});

test('LaunchAgent plist runs the shipper against the managed config', (t) => {
  const home = sandbox(t);
  const plist = render(home, 'private_Library/private_LaunchAgents/dev.jasonmatthew.ships-log-shipper.plist.tmpl');
  assert.ok(plist.includes(`<string>${home}/.local/bin/ships-log-shipper</string>`));
  assert.ok(plist.includes(`<string>${home}/.config/ships-log/shipper.json</string>`));
  if (process.platform === 'darwin') {
    const file = path.join(home, 'shipper.plist');
    writeFileSync(file, plist);
    execFileSync('plutil', ['-lint', file]);
  }
});
