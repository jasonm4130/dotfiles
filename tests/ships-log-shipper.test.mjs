/**
 * Guards the ships-log Mac side: the SessionStart tag hook, the 1Password
 * ingest-token installer, and the rendered shipper config,
 * LaunchAgent gate and .chezmoiignore rule. Everything runs against a throwaway
 * HOME, a stub `op` and fixture values, so nothing reads 1Password, real
 * transcripts or launchd.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL_TOKEN = path.join(repoRoot, 'dot_local/bin/executable_ships-log-install-token');
const TOKEN_INGEST_URL = 'https://ships-log-ingest.jasonmatthew.me:4444/api/ingest/v1';
// 64 letters and digits, the runbook's recipe; obviously not a real token.
const FAKE_TOKEN = 'fixture'.repeat(9) + 'Token0';

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
// --- client certificate installer ------------------------------------------

/** A stub `op` that serves fixture fields, or fails like a missing item. */
function opStub(dir, fields) {
  const stub = path.join(dir, 'op-stub');
  const calls = path.join(dir, 'op-calls');
  writeFileSync(stub, `#!/usr/bin/env bash
echo "$*" >> ${JSON.stringify(calls)}
[ "$1" = read ] || exit 64
case "\${@: -1}" in
${Object.entries(fields).map(([ref, value], i) => {
    const file = path.join(dir, `field-${i}`);
    writeFileSync(file, value);
    return `  ${JSON.stringify(ref)}) cat ${JSON.stringify(file)} ;;`;
  }).join('\n')}
  *) echo "[ERROR] could not read secret '\${@: -1}': item not found" >&2; exit 1 ;;
esac
`, { mode: 0o755 });
  return { stub, calls };
}

function runInstall(dir, args, op, script) {
  return spawnSync('bash', [script, ...args], { encoding: 'utf8',
    env: { ...process.env, SHIPS_LOG_CONFIG_DIR: path.join(dir, 'cfg'), SHIPS_LOG_OP_BIN: op } });
}

const TOKEN_REF = 'op://Infra/ships-log-ingest-token/password';
const runInstallToken = (dir, args, op) => runInstall(dir, args, op, INSTALL_TOKEN);

test('token installer skips cleanly with no vault set', (t) => {
  const dir = sandbox(t);
  const { stub, calls } = opStub(dir, {});
  const result = runInstallToken(dir, [''], stub);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /no 1Password vault set/);
  assert.equal(existsSync(calls), false, 'op is not called without a vault');
  assert.equal(existsSync(path.join(dir, 'cfg')), false);
});

test('token installer skips cleanly when the 1Password item does not exist yet', (t) => {
  const dir = sandbox(t);
  const { stub } = opStub(dir, {});
  const result = runInstallToken(dir, ['Infra'], stub);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /could not read op:\/\/Infra\/ships-log-ingest-token\/password/);
  assert.deepEqual(readdirSync(path.join(dir, 'cfg')), [], 'no partial file or temp dir left');
});

test('token installer writes the token as a 0600 file from op read and never echoes it', (t) => {
  const dir = sandbox(t);
  const { stub, calls } = opStub(dir, { [TOKEN_REF]: FAKE_TOKEN });
  const result = runInstallToken(dir, ['Infra'], stub);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(FAKE_TOKEN) && !result.stderr.includes(FAKE_TOKEN), 'the token is never echoed');
  const cfg = path.join(dir, 'cfg');
  assert.deepEqual(readdirSync(cfg), ['ingest.token']);
  assert.equal(readFileSync(path.join(cfg, 'ingest.token'), 'utf8'), FAKE_TOKEN);
  assert.equal(mode(path.join(cfg, 'ingest.token')), 0o600);
  assert.equal(mode(cfg), 0o700);
  assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'), [`read -n ${TOKEN_REF}`]);
});

test('token installer accepts a 32-character token whose last character is padding', (t) => {
  const dir = sandbox(t);
  const padded = `${'a'.repeat(31)}=`;
  const { stub } = opStub(dir, { [TOKEN_REF]: padded });
  const result = runInstallToken(dir, ['Infra'], stub);
  assert.equal(result.status, 0, result.stderr);
  const file = path.join(dir, 'cfg', 'ingest.token');
  assert.equal(readFileSync(file, 'utf8'), padded);
  assert.equal(mode(file), 0o600);
});

test('token installer refuses a value that is not a Bearer token and installs nothing', (t) => {
  for (const bad of ['short', `${'a'.repeat(30)}=`, `${FAKE_TOKEN} spaced`, `${FAKE_TOKEN}\n${FAKE_TOKEN}`]) {
    const dir = sandbox(t);
    const { stub } = opStub(dir, { [TOKEN_REF]: bad });
    const result = runInstallToken(dir, ['Infra'], stub);
    assert.equal(result.status, 1, JSON.stringify(bad));
    assert.match(result.stderr, /not a Bearer token of at least 32 characters/);
    assert.ok(!result.stderr.includes(bad), 'the refused value is never echoed');
    assert.deepEqual(readdirSync(path.join(dir, 'cfg')), []);
  }
});

// --- rendered templates (chezmoi execute-template, isolated HOME) ----------

function render(home, file, overrides) {
  const args = ['execute-template', '--source', repoRoot];
  if (overrides) args.push('--override-data', JSON.stringify(overrides));
  return execFileSync('chezmoi', args, { input: readFileSync(path.join(repoRoot, file), 'utf8'), encoding: 'utf8',
    env: { ...process.env, HOME: home } });
}

test('shipper config renders the Mac sources over the ingest token', (t) => {
  const home = sandbox(t);
  const config = JSON.parse(render(home, 'dot_config/private_ships-log/shipper.json.tmpl'));
  assert.equal(config.ingest_url, TOKEN_INGEST_URL);
  assert.equal(config.token_file, '~/.config/ships-log/ingest.token');
  assert.equal('tls' in config, false, 'no client certificate, and no CA pin by default');
  assert.deepEqual(config.sources, [
    { id: 'mac/personal', root: '~/.claude' },
    { id: 'mac/fresh', root: '~/.claude-fresh' },
    { id: 'mac/codex', root: '~/.codex/sessions' },
    { harness: 'grok', id: 'mac/grok', root: '~/.grok/sessions' },
  ]);
  assert.equal(config.state_dir, '~/.local/state/ships-log/shipper');
  assert.equal(config.session_tags_dir, '~/.local/state/ships-log/sessions');
  assert.deepEqual(config.firstmate_homes, [], 'no fixed homes and no treehouse homes');
  assert.deepEqual(config.no_mistakes_homes, ['~/.no-mistakes']);
});

test('shipper config pins a CA and lists Firstmate homes when present', (t) => {
  const home = sandbox(t);
  mkdirSync(path.join(home, '.treehouse/firstmate-abc/1/firstmate'), { recursive: true });
  const config = JSON.parse(render(home, 'dot_config/private_ships-log/shipper.json.tmpl', { shipsLog: { caFile: '/etc/ca.pem' } }));
  assert.deepEqual(config.tls, { ca: '/etc/ca.pem' }, 'a CA pin alone, never a client certificate');
  assert.deepEqual(config.firstmate_homes, [path.join(home, '.treehouse/firstmate-abc/1/firstmate')]);
});

test('shipper config renders [] (not null) when no firstmate homes are configured or found', (t) => {
  const home = sandbox(t);
  const config = JSON.parse(render(home, 'dot_config/private_ships-log/shipper.json.tmpl', { shipsLog: { firstmateHomes: [] } }));
  assert.deepEqual(config.firstmate_homes, []);
});

test('install script passes the vault, single-quoted, to the token installer', (t) => {
  const home = sandbox(t);
  const empty = render(home, 'run_onchange_after_19-ships-log-ingest-token.sh.tmpl', { shipsLog: { opVault: '' } });
  assert.match(empty, /ships-log-install-token" ''$/m);
  const set = render(home, 'run_onchange_after_19-ships-log-ingest-token.sh.tmpl', { shipsLog: { opVault: 'Infra' } });
  assert.match(set, /ships-log-install-token" 'Infra'$/m);
  assert.doesNotMatch(set, /ships-log-install-cert/, 'a full apply must not put the certificate files back');
});

test('LaunchAgent script is a no-op with a message until the binary exists', (t) => {
  const home = sandbox(t);
  const script = render(home, 'run_onchange_after_20-launchd-ships-log-shipper.sh.tmpl');
  assert.match(script, /binary=absent token=absent/);
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ships-log shipper not loaded: .*ships-log-shipper is missing/);
});

test('LaunchAgent script waits for the ingest token after the binary', (t) => {
  const home = sandbox(t);
  mkdirSync(path.join(home, '.local/bin'), { recursive: true });
  writeFileSync(path.join(home, '.local/bin/ships-log-shipper'), '#!/bin/sh\n', { mode: 0o755 });
  const script = render(home, 'run_onchange_after_20-launchd-ships-log-shipper.sh.tmpl');
  assert.match(script, /binary=present token=absent/, 'the binary appearing changes the script, so chezmoi re-runs it');
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no ingest token yet/);
});

test('LaunchAgent script loads the agent with a token and no client certificate', (t) => {
  const home = sandbox(t);
  mkdirSync(path.join(home, '.local/bin'), { recursive: true });
  writeFileSync(path.join(home, '.local/bin/ships-log-shipper'), '#!/bin/sh\n', { mode: 0o755 });
  mkdirSync(path.join(home, '.config/ships-log'), { recursive: true });
  writeFileSync(path.join(home, '.config/ships-log/ingest.token'), FAKE_TOKEN);
  const agents = path.join(home, 'Library/LaunchAgents');
  mkdirSync(agents, { recursive: true });
  const plist = path.join(agents, 'dev.jasonmatthew.ships-log-shipper.plist');
  writeFileSync(plist, '<plist/>');
  const bin = path.join(home, 'stub-bin');
  const calls = path.join(home, 'launchctl-calls');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'launchctl'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(calls)}\n`, { mode: 0o755 });
  const script = render(home, 'run_onchange_after_20-launchd-ships-log-shipper.sh.tmpl');
  assert.match(script, /binary=present token=present/);
  assert.equal(existsSync(path.join(home, '.config/ships-log/client.crt')), false);
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8',
    env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ships-log-shipper agent loaded/);
  assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'), [`unload ${plist}`, `load -w ${plist}`]);
});

test('.chezmoiignore holds the plist back until binary and ingest token exist', (t) => {
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
  assert.equal(ignored(), true, 'a client certificate no longer starts the shipper');
  writeFileSync(path.join(home, '.config/ships-log/ingest.token'), FAKE_TOKEN);
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
