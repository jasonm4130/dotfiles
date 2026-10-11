/**
 * wiki-sync.sh fast-forwards the llm-wiki checkout, publishes stranded inbox
 * entries and mirrors firstmate scout reports into a QMD collection, every 10
 * minutes with nobody watching. The cases that matter are the ones where it
 * must NOT act: a busy checkout is never pulled or published under its owner,
 * local commits are never pushed, and a private or denied report never reaches
 * the staging folder the index reads.
 *
 * SAFETY: every run gets a throwaway HOME, a bare remote and two clones under a
 * temp dir ("mac" stands in for ~/Work/Git/llm-wiki, "other" for another
 * writer), a stub notifier, a stub scripts/wiki.py, no global git config and
 * WIKI_SYNC_SKIP_QMD=1. runSync() refuses to run against the real HOME or wiki.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(repoRoot, 'dot_local/bin/executable_wiki-sync.sh');

// The parts of llm-wiki's `wiki.py finish` the sync relies on: stage the named
// paths, commit, rebase onto origin/main and push without force.
const WIKI_PY = `import subprocess, sys
def git(*a): subprocess.run(['git', *a], check=True)
assert sys.argv[1] == 'finish'
git('add', '--', *sys.argv[3:])
git('commit', '--quiet', '-m', sys.argv[2])
git('fetch', '--quiet', 'origin')
git('rebase', '--quiet', 'origin/main')
git('push', '--quiet', 'origin', 'HEAD:refs/heads/main')
print('Clean checkout; HEAD verified against origin/main.')
`;

const SHAREABLE = '---\ntype: Scout Report\nstatus: stable\nstale_after: "2099-01-01"\n---\n\n# Body\n';

function setup(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wiki-sync-test-'));
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
  const other = path.join(dir, 'other');
  git(dir, 'init', '--quiet', '--bare', '--initial-branch=main', remote);
  git(dir, 'clone', '--quiet', remote, mac);
  mkdirSync(path.join(mac, 'scripts'));
  mkdirSync(path.join(mac, 'inbox'));
  mkdirSync(path.join(mac, 'pages'));
  writeFileSync(path.join(mac, 'scripts/wiki.py'), WIKI_PY);
  writeFileSync(path.join(mac, 'inbox/README.md'), 'inbox\n');
  writeFileSync(path.join(mac, 'pages/qmd.md'), 'v1\n');
  git(mac, 'add', '-A');
  git(mac, 'commit', '--quiet', '-m', 'seed');
  git(mac, 'push', '--quiet', 'origin', 'main');
  git(dir, 'clone', '--quiet', remote, other);

  const reports = path.join(dir, 'reports');
  mkdirSync(reports);
  const policy = path.join(dir, 'fm-reports.policy');
  const stage = path.join(dir, 'stage');
  const notes = path.join(dir, 'notifications.log');
  const notifier = path.join(dir, 'notify.sh');
  writeFileSync(notifier, `#!/bin/sh\nprintf '%s | %s\\n' "$1" "$2" >> '${notes}'\n`, { mode: 0o755 });
  const state = path.join(dir, 'state');
  const log = path.join(dir, 'wiki-sync.log');

  function runSync(extra = {}) {
    if (path.resolve(home) === path.resolve(os.homedir()) || mac === path.join(os.homedir(), 'Work/Git/llm-wiki')) {
      throw new Error('refusing to run wiki-sync against the real HOME or wiki');
    }
    return spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...env, WIKI_SYNC_DIR: mac, WIKI_SYNC_REPORTS_DIR: reports, WIKI_SYNC_POLICY: policy,
        WIKI_SYNC_STAGE_DIR: stage, WIKI_SYNC_STATE_DIR: state, WIKI_SYNC_LOG: log,
        WIKI_SYNC_REACH_HOST: '', WIKI_SYNC_NOTIFY: notifier, WIKI_SYNC_SKIP_QMD: '1',
        WIKI_SYNC_TODAY: '2026-10-11', ...extra,
      },
    });
  }
  const pushFromOther = (file, body, msg) => {
    writeFileSync(path.join(other, file), body);
    git(other, 'add', '-A');
    git(other, 'commit', '--quiet', '-m', msg);
    git(other, 'push', '--quiet', 'origin', 'main');
  };
  const report = (slug, body) => {
    mkdirSync(path.join(reports, slug), { recursive: true });
    writeFileSync(path.join(reports, slug, 'report.md'), body);
  };
  const settle = (file) => {
    const old = new Date(Date.now() - 3600 * 1000);
    utimesSync(file, old, old);
  };
  const staged = () => (existsSync(stage) ? readdirSync(stage).sort() : []);
  const notifications = () => (existsSync(notes) ? readFileSync(notes, 'utf8').trim().split('\n') : []);
  const logText = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  return { env, git, remote, mac, other, state, policy, stage, runSync, pushFromOther, report, settle, staged, notifications, logText };
}

test('a clean checkout behind origin is fast-forwarded', (t) => {
  const s = setup(t);
  s.pushFromOther('pages/qmd.md', 'v2\n', 'ingest: update qmd');

  const r = s.runSync();
  assert.equal(r.status, 0, s.logText());
  assert.equal(readFileSync(path.join(s.mac, 'pages/qmd.md'), 'utf8'), 'v2\n');
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), s.git(s.remote, 'rev-parse', 'main'));
  assert.match(s.logText(), /fast-forwarded/);
  assert.deepEqual(s.notifications(), []);
});

test('tracked edits block the pull and only alert once the checkout has been unsynced for hours', (t) => {
  const s = setup(t);
  s.pushFromOther('pages/qmd.md', 'v2\n', 'ingest: update qmd');
  writeFileSync(path.join(s.mac, 'pages/qmd.md'), 'mid-edit\n');
  const before = s.git(s.mac, 'rev-parse', 'HEAD');

  assert.equal(s.runSync().status, 0, s.logText());
  assert.equal(readFileSync(path.join(s.mac, 'pages/qmd.md'), 'utf8'), 'mid-edit\n');
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), before);
  assert.match(s.logText(), /not syncing this run: .*uncommitted changes to tracked files/);
  assert.deepEqual(s.notifications(), []);

  // Seven hours without a sync turns the same state into an alert.
  writeFileSync(path.join(s.state, 'last-synced'), `${Math.floor(Date.now() / 1000) - 7 * 3600}\n`);
  assert.equal(s.runSync().status, 0);
  assert.equal(s.notifications().length, 1);
  assert.match(s.notifications()[0], /^Wiki sync stopped \| the wiki has not synced for 7h: /);

  // He finishes the edit; the next run catches up and clears the alert.
  s.git(s.mac, 'checkout', '--', 'pages/qmd.md');
  assert.equal(s.runSync().status, 0, s.logText());
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), s.git(s.remote, 'rev-parse', 'main'));
  assert.match(s.notifications()[1], /^Wiki sync \| Resolved/);
});

test('settled stranded inbox entries are published unsigned through wiki.py, then the checkout is current', (t) => {
  const s = setup(t);
  s.pushFromOther('pages/new.md', 'from elsewhere\n', 'ingest: new page');
  const entry = path.join(s.mac, 'inbox/2026-10-11-0956-a-finding.md');
  writeFileSync(entry, '# A finding\n');
  s.settle(entry);
  s.git(s.mac, 'config', 'commit.gpgsign', 'true');

  const r = s.runSync();
  assert.equal(r.status, 0, s.logText());
  assert.equal(s.git(s.mac, 'status', '--porcelain'), '');
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), s.git(s.remote, 'rev-parse', 'main'));
  assert.match(s.git(s.remote, 'log', '-1', '--format=%s', 'main'), /^inbox: publish 1 stranded entry from /);
  assert.equal(s.git(s.remote, 'log', '-1', '--format=%G?', 'main'), 'N');
  assert.match(s.git(s.remote, 'ls-tree', '-r', '--name-only', 'main'), /inbox\/2026-10-11-0956-a-finding\.md/);
  assert.ok(existsSync(path.join(s.mac, 'pages/new.md')));
});

test('inbox entries wait while one is still being written or other work is untracked', (t) => {
  const s = setup(t);
  const settled = path.join(s.mac, 'inbox/2026-10-11-0900-old.md');
  writeFileSync(settled, '# old\n');
  s.settle(settled);
  writeFileSync(path.join(s.mac, 'inbox/2026-10-11-1100-new.md'), '# still being written\n');
  const remoteHead = s.git(s.remote, 'rev-parse', 'main');

  assert.equal(s.runSync().status, 0, s.logText());
  assert.equal(s.git(s.remote, 'rev-parse', 'main'), remoteHead, 'nothing pushed');
  assert.match(s.logText(), /inbox entries wait/);

  // Settled, but an untracked page is someone's ingest in progress.
  s.settle(path.join(s.mac, 'inbox/2026-10-11-1100-new.md'));
  writeFileSync(path.join(s.mac, 'pages/draft.md'), 'draft\n');
  assert.equal(s.runSync().status, 0, s.logText());
  assert.equal(s.git(s.remote, 'rev-parse', 'main'), remoteHead, 'still nothing pushed');
  assert.ok(existsSync(path.join(s.mac, 'pages/draft.md')));
});

test('local commits are neither pushed nor pulled over', (t) => {
  const s = setup(t);
  writeFileSync(path.join(s.mac, 'pages/qmd.md'), 'local\n');
  s.git(s.mac, 'commit', '--quiet', '-am', 'local ingest');
  const local = s.git(s.mac, 'rev-parse', 'HEAD');
  const remoteHead = s.git(s.remote, 'rev-parse', 'main');

  assert.equal(s.runSync().status, 0, s.logText());
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), local);
  assert.equal(s.git(s.remote, 'rev-parse', 'main'), remoteHead);
  assert.match(s.logText(), /1 local commit\(s\) not on origin\/main/);
});

test('a diverged checkout is left as it was', (t) => {
  const s = setup(t);
  s.pushFromOther('pages/qmd.md', 'theirs\n', 'remote ingest');
  writeFileSync(path.join(s.mac, 'pages/other.md'), 'mine\n');
  s.git(s.mac, 'add', '-A');
  s.git(s.mac, 'commit', '--quiet', '-m', 'local ingest');
  const local = s.git(s.mac, 'rev-parse', 'HEAD');

  assert.equal(s.runSync().status, 0, s.logText());
  assert.equal(s.git(s.mac, 'rev-parse', 'HEAD'), local);
  assert.equal(readFileSync(path.join(s.mac, 'pages/qmd.md'), 'utf8'), 'v1\n');
});

test('only allowed, frontmattered, non-private, unexpired, undenied reports are staged', (t) => {
  const s = setup(t);
  writeFileSync(s.policy, [
    '# allow first, deny wins',
    'allow ok-*',
    'allow ci-runners',
    'allow no-frontmatter',
    'allow ok-but-private',
    'allow expired',
    'deny ok-denied*',
  ].join('\n') + '\n');
  s.report('ok-one', SHAREABLE);
  s.report('ci-runners', SHAREABLE.replace('status: stable', 'status: stable\nvisibility: shareable'));
  s.report('ok-denied', SHAREABLE.replace('status: stable', 'status: stable\nvisibility: shareable'));
  s.report('ok-but-private', SHAREABLE.replace('status: stable', 'status: stable\nvisibility: private'));
  s.report('no-frontmatter', '# Report\nno frontmatter here\n');
  s.report('expired', SHAREABLE.replace('2099-01-01', '2026-10-10'));
  s.report('unlisted', SHAREABLE);
  s.report('self-declared', SHAREABLE.replace('status: stable', 'status: stable\nvisibility: shareable'));

  assert.equal(s.runSync().status, 0, s.logText());
  assert.deepEqual(s.staged(), ['ci-runners.md', 'ok-one.md', 'self-declared.md']);
  assert.equal(readFileSync(path.join(s.stage, 'ok-one.md'), 'utf8'), SHAREABLE);

  // A later deny, or a report turning private, removes it from the stage.
  writeFileSync(s.policy, readFileSync(s.policy, 'utf8') + 'deny ok-one\n');
  s.report('self-declared', SHAREABLE.replace('status: stable', 'status: stable\nvisibility: private'));
  assert.equal(s.runSync().status, 0, s.logText());
  assert.deepEqual(s.staged(), ['ci-runners.md']);
  assert.match(s.logText(), /dropped ok-one\.md from fm-reports/);
});

test('without a policy file no report is staged, even a stale copy from before', (t) => {
  const s = setup(t);
  s.report('ok-one', SHAREABLE);
  mkdirSync(s.stage);
  writeFileSync(path.join(s.stage, 'ok-one.md'), SHAREABLE);

  assert.equal(s.runSync().status, 0, s.logText());
  assert.deepEqual(s.staged(), []);
  assert.match(s.logText(), /no report policy at /);
});
