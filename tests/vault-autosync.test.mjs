/**
 * vault-autosync.sh commits, pulls and pushes the live Obsidian vault every 10
 * minutes with nobody watching, so the cases that matter are the ones where it
 * must NOT act: a conflict must leave the clone exactly as it was and unpushed,
 * and someone mid-rebase must not have their index staged under them.
 *
 * SAFETY: every run gets a throwaway HOME, a bare remote and two clones under a
 * temp dir ("mac" stands in for ~/Documents/Main, "mate" for the second mate),
 * a stub notifier instead of osascript, and no global git config. runSync()
 * refuses to run against the real HOME or the real vault.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(repoRoot, 'dot_local/bin/executable_vault-autosync.sh');

function setup(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vault-autosync-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home');
  mkdirSync(home);
  const gitconfig = path.join(dir, 'gitconfig');
  writeFileSync(gitconfig, '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n');
  const env = {
    PATH: process.env.PATH, HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1',
  };
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  const remote = path.join(dir, 'remote.git');
  const mac = path.join(dir, 'mac');
  const mate = path.join(dir, 'mate');
  git(dir, 'init', '--quiet', '--bare', '--initial-branch=main', remote);
  git(dir, 'clone', '--quiet', remote, mac);
  writeFileSync(path.join(mac, 'note.md'), 'line one\n');
  writeFileSync(path.join(mac, '.gitignore'), '.obsidian/workspace.json\n');
  git(mac, 'add', '-A');
  git(mac, 'commit', '--quiet', '-m', 'seed');
  git(mac, 'push', '--quiet', 'origin', 'main');
  git(dir, 'clone', '--quiet', remote, mate);

  const notes = path.join(dir, 'notifications.log');
  const notifier = path.join(dir, 'notify.sh');
  writeFileSync(notifier, `#!/bin/sh\nprintf '%s | %s\\n' "$1" "$2" >> '${notes}'\n`, { mode: 0o755 });
  const state = path.join(dir, 'state');
  const log = path.join(dir, 'vault-autosync.log');

  function runSync(extra = {}) {
    if (path.resolve(home) === path.resolve(os.homedir()) || mac === path.join(os.homedir(), 'Documents/Main')) {
      throw new Error('refusing to run vault-autosync against the real HOME or vault');
    }
    return spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...env, VAULT_SYNC_DIR: mac, VAULT_SYNC_STATE_DIR: state, VAULT_SYNC_LOG: log,
        VAULT_SYNC_REACH_HOST: '', VAULT_SYNC_NOTIFY: notifier, ...extra,
      },
    });
  }
  const notifications = () => (existsSync(notes) ? readFileSync(notes, 'utf8').trim().split('\n') : []);
  const logText = () => readFileSync(log, 'utf8');
  return { env, git, remote, mac, mate, state, log, runSync, notifications, logText };
}

test('a local edit is committed unsigned and pushed; ignored files stay out', (t) => {
  const s = setup(t);
  writeFileSync(path.join(s.mac, 'note.md'), 'line one\nedited on the mac\n');
  writeFileSync(path.join(s.mac, 'new.md'), 'brand new\n');
  mkdirSync(path.join(s.mac, '.obsidian'));
  writeFileSync(path.join(s.mac, '.obsidian/workspace.json'), '{}');

  const r = s.runSync();
  assert.equal(r.status, 0, s.logText());
  assert.equal(s.git(s.mac, 'status', '--porcelain'), '');
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), s.git(s.remote, 'rev-parse', 'main'), 'pushed');
  assert.match(s.git(s.remote, 'log', '-1', '--format=%s', 'main'), /^vault autosync: 2 file\(s\) from /);
  assert.equal(s.git(s.remote, 'log', '-1', '--format=%G?', 'main'), 'N');
  assert.doesNotMatch(s.git(s.remote, 'ls-tree', '-r', '--name-only', 'main'), /workspace\.json/);
  assert.match(s.logText(), /committed 2 file\(s\)[\s\S]*pushed 1 commit\(s\)/);
  assert.deepEqual(s.notifications(), []);
});

test('a remote commit is pulled, alongside a non-conflicting local edit', (t) => {
  const s = setup(t);
  writeFileSync(path.join(s.mate, 'from-mate.md'), 'filed by the second mate\n');
  s.git(s.mate, 'add', '-A');
  s.git(s.mate, 'commit', '--quiet', '-m', 'second mate: file a note');
  s.git(s.mate, 'push', '--quiet', 'origin', 'main');
  writeFileSync(path.join(s.mac, 'mine.md'), 'mac only\n');

  const r = s.runSync();
  assert.equal(r.status, 0, s.logText());
  assert.equal(readFileSync(path.join(s.mac, 'from-mate.md'), 'utf8'), 'filed by the second mate\n');
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), s.git(s.remote, 'rev-parse', 'main'));
  assert.equal(s.git(s.remote, 'log', '-1', '--format=%s', 'main^'), 'second mate: file a note', 'rebased, not merged');
  assert.equal(s.git(s.remote, 'rev-list', '--merges', '--count', 'main'), '0');
});

test('a conflict leaves the clone untouched and unpushed, alerts at most hourly, then recovers', (t) => {
  const s = setup(t);
  writeFileSync(path.join(s.mate, 'note.md'), 'line one, as the mate wrote it\n');
  s.git(s.mate, 'commit', '--quiet', '-am', 'second mate: reword');
  s.git(s.mate, 'push', '--quiet', 'origin', 'main');
  const mateHead = s.git(s.remote, 'rev-parse', 'main');
  writeFileSync(path.join(s.mac, 'note.md'), 'line one, as the captain wrote it\n');

  const r = s.runSync();
  assert.equal(r.status, 1);
  const localHead = s.git(s.mac, 'rev-parse', 'HEAD');
  assert.match(s.git(s.mac, 'log', '-1', '--format=%s'), /^vault autosync:/, 'the local edit is kept as a commit');
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD^'), s.git(s.mate, 'rev-parse', 'HEAD^'), 'not rebased');
  assert.equal(readFileSync(path.join(s.mac, 'note.md'), 'utf8'), 'line one, as the captain wrote it\n');
  assert.equal(s.git(s.mac, 'status', '--porcelain'), '');
  for (const m of ['rebase-merge', 'rebase-apply']) assert.ok(!existsSync(path.join(s.mac, '.git', m)), m);
  assert.equal(s.git(s.remote, 'rev-parse', 'main'), mateHead, 'nothing pushed');
  assert.equal(s.notifications().length, 1);
  assert.match(s.notifications()[0], /^Vault sync stopped \| conflict with origin\/main in note\.md\. Nothing pushed/);
  assert.match(s.logText(), /ALERT: conflict/);

  // A run inside the hour logs the alert again but does not re-notify.
  assert.equal(s.runSync().status, 1);
  assert.equal(s.notifications().length, 1);
  assert.match(s.logText(), /notification suppressed/);
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), localHead);

  // An hour later it notifies again.
  const alertFile = path.join(s.state, 'alert');
  writeFileSync(alertFile, readFileSync(alertFile, 'utf8').replace(/^\d+/, String(Math.floor(Date.now() / 1000) - 3601)));
  assert.equal(s.runSync().status, 1);
  assert.equal(s.notifications().length, 2);

  // He settles it by hand; the next run pushes and says so.
  assert.notEqual(spawnSync('git', ['rebase', 'origin/main'], { cwd: s.mac, env: s.env }).status, 0, 'conflicts by hand too');
  writeFileSync(path.join(s.mac, 'note.md'), 'line one, settled\n');
  s.git(s.mac, 'add', 'note.md');
  execFileSync('git', ['rebase', '--continue'], { cwd: s.mac, env: { ...s.env, GIT_EDITOR: 'true' }, stdio: 'ignore' });
  assert.equal(s.runSync().status, 0, s.logText());
  assert.equal(s.git(s.remote, 'rev-parse', 'main'), s.git(s.mac, 'rev-parse', 'HEAD'));
  assert.ok(!existsSync(alertFile));
  assert.match(s.notifications().at(-1), /Resolved/);
});

test('a rebase already in progress is left alone: nothing staged, committed or pushed', (t) => {
  const s = setup(t);
  const head = s.git(s.mac, 'rev-parse', 'HEAD');
  mkdirSync(path.join(s.mac, '.git', 'rebase-merge'));
  writeFileSync(path.join(s.mac, 'half-done.md'), 'x\n');

  assert.equal(s.runSync().status, 1);
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), head);
  assert.equal(s.git(s.mac, 'diff', '--cached', '--name-only'), '');
  assert.match(s.notifications()[0], /rebase-merge in progress/);
});

test('a run is skipped while another holds the lock, and a dead holder\'s lock is reclaimed', (t) => {
  const s = setup(t);
  writeFileSync(path.join(s.mac, 'pending.md'), 'x\n');
  mkdirSync(path.join(s.state, 'lock'), { recursive: true });
  writeFileSync(path.join(s.state, 'lock', 'pid'), String(process.pid));

  assert.equal(s.runSync().status, 0);
  assert.match(s.logText(), /still going; skipping/);
  assert.notEqual(s.git(s.mac, 'status', '--porcelain'), '', 'did not touch the vault');

  writeFileSync(path.join(s.state, 'lock', 'pid'), '999999');
  assert.equal(s.runSync().status, 0, s.logText());
  assert.match(s.logText(), /reclaiming stale lock/);
  assert.equal(s.git(s.mac, 'status', '--porcelain'), '');
  assert.ok(!existsSync(path.join(s.state, 'lock')), 'lock released');
});

test('an unreachable remote is skipped quietly after the local commit', (t) => {
  const s = setup(t);
  s.git(s.mac, 'remote', 'set-url', 'origin', 'https://nonexistent.invalid/vault.git');
  writeFileSync(path.join(s.mac, 'offline.md'), 'x\n');

  assert.equal(s.runSync().status, 0, s.logText());
  assert.match(s.logText(), /committed 1 file\(s\)[\s\S]*offline/);
  assert.deepEqual(s.notifications(), []);
});

test('the log is rotated once it passes the size bound', (t) => {
  const s = setup(t);
  writeFileSync(s.log, 'x'.repeat(200));
  writeFileSync(path.join(s.mac, 'a.md'), 'a\n');
  assert.equal(s.runSync({ VAULT_SYNC_LOG_MAX_BYTES: '100' }).status, 0);
  assert.equal(readFileSync(`${s.log}.1`, 'utf8'), 'x'.repeat(200));
  assert.match(s.logText(), /committed 1 file/);
});
