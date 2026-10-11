/**
 * Guards fm-home-permissions, which renders a firstmate home's
 * .claude/settings.local.json: the supervisor script allow rules in the absolute
 * and the relative (contract) form, with fm-pr-merge only for a +yolo home.
 *
 * Main runs --write under an ask rule and --check under an allow rule, so the mode
 * must be an explicit flag: an ask rule naming the bare command would also match
 * --check, and ask outranks allow.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'dot_local/bin/executable_fm-home-permissions');

function fakeHome(t) {
  const home = mkdtempSync(path.join(tmpdir(), 'fm-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(path.join(home, 'bin'));
  writeFileSync(path.join(home, 'bin/fm-wake-drain.sh'), '#!/bin/sh\n', { mode: 0o755 });
  return home;
}
const run = (...args) => spawnSync('bash', [script, ...args], { encoding: 'utf8' });
const settings = (home) => JSON.parse(readFileSync(path.join(home, '.claude/settings.local.json'), 'utf8'));

test('--write renders both rule forms and --check then reports it current', (t) => {
  const home = fakeHome(t);
  assert.equal(run(home, '--check').status, 1, 'a missing file is stale');
  const w = run(home, '--write');
  assert.equal(w.status, 0, w.stderr);
  const { allow, ask } = settings(home).permissions;
  for (const rule of [
    `Bash(${home}/bin/fm-wake-drain.sh *)`,
    `Bash(${home}/bin/fm-wake-drain.sh)`,
    `Bash(FM_HOME=* ${home}/bin/fm-wake-drain.sh *)`,
    'Bash(bin/fm-wake-drain.sh *)',
    'Bash(bin/fm-wake-drain.sh)',
    'Bash(FM_HOME=* bin/fm-wake-drain.sh *)',
    'Bash(bin/fm-branch-report.sh *)',
  ]) {
    assert.ok(allow.includes(rule), `missing ${rule}`);
  }
  assert.equal(allow.length, 21 * 6);
  assert.deepEqual(allow.filter((r) => r.includes('fm-pr-merge')), []);
  assert.deepEqual(ask, ['Bash(*fm-pr-merge.sh*--allow-red*)', 'Bash(*fm-teardown.sh*--force*)']);
  const c = run(home, '--check');
  assert.equal(c.status, 0);
  assert.match(c.stdout, /^current: /);
});

test('--yolo adds fm-pr-merge, and --check tells the two postures apart', (t) => {
  const home = fakeHome(t);
  assert.equal(run(home, '--yolo', '--write').status, 0);
  assert.ok(settings(home).permissions.allow.includes('Bash(bin/fm-pr-merge.sh *)'));
  assert.equal(settings(home).permissions.allow.length, 22 * 6);
  assert.equal(run(home, '--yolo', '--check').status, 0);
  assert.equal(run(home, '--check').status, 1);
});

test('bad invocations change nothing', (t) => {
  const home = fakeHome(t);
  for (const args of [[home], [home, '--check', '--write'], [home, '--bogus', '--write'], ['relative/home', '--write']]) {
    assert.equal(run(...args).status, 2, args.join(' '));
  }
  const notHome = mkdtempSync(path.join(tmpdir(), 'not-home-'));
  t.after(() => rmSync(notHome, { recursive: true, force: true }));
  assert.equal(run(notHome, '--write').status, 2);
  assert.ok(!existsSync(path.join(home, '.claude')) && !existsSync(path.join(notHome, '.claude')));
});
