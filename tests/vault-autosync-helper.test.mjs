/**
 * vault-autosync-helper holds a Full Disk Access grant, so what matters is what
 * it refuses: arguments, a script path or override from its environment, and a
 * script someone else could rewrite. Each test compiles it against a throwaway
 * HOME whose ~/.local/bin/vault-autosync.sh is a stub recording how it was run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(repoRoot, 'dot_local/src/exact_vault-autosync-helper/main.c');

function setup(t, { exitCode = 0 } = {}) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'vault-autosync-helper-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const bin = path.join(home, '.local/bin');
  mkdirSync(bin, { recursive: true });
  const record = path.join(home, 'record');
  const script = path.join(bin, 'vault-autosync.sh');
  writeFileSync(script, `#!/bin/sh\n{ echo "args=$#"; env; } > '${record}'\nexit ${exitCode}\n`, { mode: 0o755 });
  const helper = path.join(home, 'helper');
  execFileSync('clang', ['-O2', '-Wall', '-Wextra', '-Werror', `-DSYNC_HOME="${home}"`, '-o', helper, SOURCE]);
  const run = (args = [], env = {}) =>
    spawnSync(helper, args, { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  const recorded = () => readFileSync(record, 'utf8');
  return { home, script, record, run, recorded };
}

test('runs the compiled-in script with a fixed environment and passes its exit code', (t) => {
  const s = setup(t, { exitCode: 3 });
  const r = s.run([], { HOME: '/elsewhere', VAULT_SYNC_DIR: '/elsewhere/vault', USER: 'someone', TMPDIR: '/tmp/x' });
  assert.equal(r.status, 3, r.stderr);
  const env = s.recorded();
  assert.match(env, /^args=0$/m);
  assert.match(env, new RegExp(`^HOME=${s.home}$`, 'm'));
  assert.match(env, /^PATH=\/opt\/homebrew\/bin:/m);
  assert.match(env, /^USER=someone$/m);
  assert.match(env, /^TMPDIR=\/tmp\/x$/m);
  assert.doesNotMatch(env, /VAULT_SYNC_DIR/);
});

test('refuses any argument without running the script', (t) => {
  const s = setup(t);
  const r = s.run(['/tmp/other.sh']);
  assert.equal(r.status, 64);
  assert.throws(() => s.recorded(), /ENOENT/);
});

test('refuses a script writable by group or others', (t) => {
  const s = setup(t);
  chmodSync(s.script, 0o775);
  const r = s.run();
  assert.equal(r.status, 77);
  assert.match(r.stderr, /refusing/);
  assert.throws(() => s.recorded(), /ENOENT/);
});

test('reports a missing script', (t) => {
  const s = setup(t);
  rmSync(s.script);
  assert.equal(s.run().status, 66);
});
