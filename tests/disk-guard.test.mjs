/**
 * disk-guard.sh is the highest-blast-radius script in this repo: it is wired as
 * a PreToolUse hook on Bash (so a bug blocks every command in every session),
 * and its reclaim path runs `rm -rf` over worktree target/ dirs and the shared
 * cargo cache. It shipped untested.
 *
 * The keep/remove decisions get the most attention here, because the failure
 * that motivated them already happened once: on 2026-07-29 an earlier version
 * removed a LIVE session worktree that was 11 commits ahead of origin, on the
 * theory that "the branch exists on the remote" meant the checkout was
 * disposable. Uncommitted work was lost. Every "keep" case below is a guard
 * against a variant of that.
 *
 * SAFETY: every invocation runs with HOME and DISK_GUARD_GIT_ROOT pointed into
 * a temp dir, and runGuard() refuses to execute if HOME is the real one. A test
 * that leaked the real HOME would delete the developer's actual cargo cache and
 * agent worktrees.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const guard = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../private_dot_claude/hooks/executable_disk-guard.sh',
);

/** Run disk-guard.sh. Returns {code, stdout, stderr}. */
function runGuard(args, { home, gitRoot, warnGb, blockGb, stdin = '' } = {}) {
  if (!home || path.resolve(home) === path.resolve(homedir())) {
    throw new Error('refusing to run disk-guard against the real HOME — reclaim deletes directories');
  }
  const env = { PATH: process.env.PATH, HOME: home };
  if (gitRoot) env.DISK_GUARD_GIT_ROOT = gitRoot;
  if (warnGb !== undefined) env.DISK_GUARD_WARN_GB = String(warnGb);
  if (blockGb !== undefined) env.DISK_GUARD_BLOCK_GB = String(blockGb);
  try {
    const stdout = execFileSync('bash', [guard, ...args], { env, input: stdin, encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

/** Free-standing temp HOME, auto-removed. */
function tempHome(t) {
  const home = mkdtempSync(path.join(tmpdir(), 'disk-guard-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

const sh = (script, cwd) =>
  execFileSync('bash', ['-euo', 'pipefail', '-c', script], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    },
  });

/**
 * Build a repo under <gitRoot>/repo with one agent worktree per interesting
 * state, each holding a target/ dir. Returns {gitRoot, worktrees}.
 */
function buildFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'disk-guard-git-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitRoot = path.join(root, 'gitroot');
  mkdirSync(gitRoot);

  sh(`
    git init --bare -q -b main origin.git
    git clone -q origin.git gitroot/repo
    cd gitroot/repo
    echo base > f.txt && git add f.txt && git commit -qm base && git push -q origin main

    for w in wt-pushed wt-dirty wt-ahead wt-locked; do
      git worktree add -q ".claude/worktrees/$w" -b "$w"
    done
    git worktree add -q --detach .claude/worktrees/wt-detached
    git worktree add -q --detach .claude/worktrees/wt-lockdetach

    # wt-pushed / wt-dirty / wt-locked exist on the remote at the same sha
    git push -q origin wt-pushed wt-dirty wt-locked

    echo uncommitted > .claude/worktrees/wt-dirty/new.txt
    ( cd .claude/worktrees/wt-ahead && echo x > a.txt && git add a.txt && git commit -qm ahead )
    git worktree lock .claude/worktrees/wt-locked
    git worktree lock .claude/worktrees/wt-lockdetach

    for w in wt-pushed wt-dirty wt-ahead wt-locked wt-detached wt-lockdetach; do
      mkdir -p ".claude/worktrees/$w/target" && echo artifact > ".claude/worktrees/$w/target/blob"
    done
  `, root);

  return {
    gitRoot,
    worktreeDir: path.join(gitRoot, 'repo/.claude/worktrees'),
  };
}

const STARVED = 999_999_999; // threshold above any real free space
const HEALTHY = 0;           // threshold below any real free space

test('free-gb prints an integer', (t) => {
  const { stdout, code } = runGuard(['free-gb'], { home: tempHome(t) });
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+$/);
});

test('check warns below the threshold and is silent above it', (t) => {
  const home = tempHome(t);
  const starved = runGuard(['check'], { home, warnGb: STARVED });
  assert.match(starved.stdout, /Low disk/);
  assert.match(starved.stdout, /disk-guard\.sh reclaim/, 'the warning must say how to fix it');

  const healthy = runGuard(['check'], { home, warnGb: HEALTHY });
  assert.equal(healthy.stdout.trim(), '', 'a healthy disk must produce no output');
});

test('pretool allows everything when the disk is healthy', (t) => {
  const r = runGuard(['pretool'], {
    home: tempHome(t),
    blockGb: HEALTHY,
    stdin: JSON.stringify({ tool_input: { command: 'cargo build --release' } }),
  });
  assert.equal(r.code, 0);
});

test('pretool blocks heavy cargo builds when the disk is critically low', (t) => {
  const home = tempHome(t);
  for (const command of [
    'cargo build', 'cargo test', 'cargo clippy', 'cargo run',
    'cargo doc', 'cargo bench', 'cargo xtask ci', 'cargo component build',
  ]) {
    const r = runGuard(['pretool'], {
      home, blockGb: STARVED,
      stdin: JSON.stringify({ tool_input: { command } }),
    });
    assert.equal(r.code, 2, `${command} should be blocked`);
    assert.match(r.stderr, /BLOCKED by disk-guard/);
  }
});

test('pretool lets non-build commands through even when starved', (t) => {
  const home = tempHome(t);
  for (const command of ['ls -la', 'git status', 'cargo --version', 'cargo fmt', 'npm run build']) {
    const r = runGuard(['pretool'], {
      home, blockGb: STARVED,
      stdin: JSON.stringify({ tool_input: { command } }),
    });
    assert.equal(r.code, 0, `${command} should be allowed`);
  }
});

test('pretool matching is a substring test, and over-blocks by design', (t) => {
  // `echo cargo build` contains "cargo build" and is blocked. Documented rather
  // than fixed: distinguishing it would mean parsing shell command lines inside
  // a guard whose whole job is to be dumb and predictable, and this path only
  // engages below 8GB free — an emergency where over-blocking is the safe error.
  // If that judgement is ever revisited, this test is the thing to change.
  const r = runGuard(['pretool'], {
    home: tempHome(t),
    blockGb: STARVED,
    stdin: JSON.stringify({ tool_input: { command: 'echo cargo build' } }),
  });
  assert.equal(r.code, 2);
});

test('pretool fails open on unparseable stdin', (t) => {
  const home = tempHome(t);
  for (const stdin of ['', 'not json', '{}']) {
    const r = runGuard(['pretool'], { home, blockGb: STARVED, stdin });
    assert.equal(r.code, 0, 'a guard that cannot read its input must not block the build');
  }
});

test('reclaim deletes rebuildable target/ dirs in every agent worktree', (t) => {
  const home = tempHome(t);
  const { gitRoot, worktreeDir } = buildFixture(t);

  const before = readdirSync(worktreeDir).filter((w) => existsSync(path.join(worktreeDir, w, 'target')));
  assert.equal(before.length, 6, 'fixture should start with six target/ dirs');

  const r = runGuard(['reclaim'], { home, gitRoot });
  assert.equal(r.code, 0);

  const after = readdirSync(worktreeDir).filter((w) => existsSync(path.join(worktreeDir, w, 'target')));
  assert.deepEqual(after, [], 'every target/ should be gone');
  // Plain reclaim must not remove worktrees themselves — only build output.
  assert.equal(readdirSync(worktreeDir).length, 6, 'plain reclaim must not remove any worktree');
});

test('reclaim --deep removes ONLY the clean, fully-pushed worktree', (t) => {
  const home = tempHome(t);
  const { gitRoot, worktreeDir } = buildFixture(t);

  const r = runGuard(['reclaim', '--deep'], { home, gitRoot });
  assert.equal(r.code, 0);

  const survivors = readdirSync(worktreeDir).sort();
  assert.deepEqual(
    survivors,
    ['wt-ahead', 'wt-detached', 'wt-dirty', 'wt-lockdetach', 'wt-locked'],
    'only wt-pushed (clean + local tip == remote tip) may be removed',
  );

  // The reason matters as much as the outcome — a worktree kept for the wrong
  // reason is a worktree whose real guard is not running.
  assert.match(r.stdout, /keep \(dirty\): .*wt-dirty/);
  assert.match(r.stdout, /keep \(locked\): .*wt-locked/);
  assert.match(r.stdout, /keep \(detached\): .*wt-detached/);
  assert.match(r.stdout, /keep \(unpushed or no remote\): .*wt-ahead/);
  assert.match(r.stdout, /remove worktree \(fully pushed, clean\): .*wt-pushed/);
});

test('a locked worktree that is also detached is kept FOR BEING LOCKED', (t) => {
  const home = tempHome(t);
  const { gitRoot } = buildFixture(t);
  const r = runGuard(['reclaim', '--deep'], { home, gitRoot });

  // Regression guard. The porcelain parse used to split on tab, and tab is an
  // IFS *whitespace* character: a detached worktree emits an empty ref field,
  // consecutive tabs collapsed into one delimiter, and every later field
  // shifted left — `locked` came through empty, so the locked check never ran
  // for a detached worktree. It survived only because rev-parse then failed on
  // a garbage branch name. Fields are separated by \037 now.
  assert.match(r.stdout, /keep \(locked\): .*wt-lockdetach/);
  assert.doesNotMatch(
    r.stdout,
    /keep \(no local ref\): .*wt-lockdetach/,
    'reaching the no-local-ref branch means the locked check was skipped',
  );
});

test('a worktree whose remote tip has moved is kept', (t) => {
  const home = tempHome(t);
  const { gitRoot, worktreeDir } = buildFixture(t);

  // Someone else pushes to wt-pushed: local tip != remote tip, so the checkout
  // is no longer provably redundant even though it is clean.
  sh(`
    git clone -q origin.git other
    cd other && git checkout -q wt-pushed
    echo theirs > theirs.txt && git add theirs.txt && git commit -qm theirs
    git push -q origin wt-pushed
  `, path.dirname(gitRoot));

  const r = runGuard(['reclaim', '--deep'], { home, gitRoot });
  assert.ok(
    readdirSync(worktreeDir).includes('wt-pushed'),
    'a clean worktree whose remote has advanced must NOT be removed',
  );
  assert.match(r.stdout, /keep \(unpushed or no remote\): .*wt-pushed/);
});

test('reclaim --deep empties the shared cargo cache but keeps the directory', (t) => {
  const home = tempHome(t);
  const { gitRoot } = buildFixture(t);
  const cache = path.join(home, '.cache/cargo/target');
  mkdirSync(cache, { recursive: true });
  writeFileSync(path.join(cache, 'blob'), 'artifact');

  runGuard(['reclaim', '--deep'], { home, gitRoot });

  assert.ok(existsSync(cache), 'the cache directory itself should survive');
  assert.deepEqual(readdirSync(cache), [], 'its contents should be gone');
});

test('plain reclaim leaves the cargo cache alone', (t) => {
  const home = tempHome(t);
  const { gitRoot } = buildFixture(t);
  const cache = path.join(home, '.cache/cargo/target');
  mkdirSync(cache, { recursive: true });
  writeFileSync(path.join(cache, 'blob'), 'artifact');

  runGuard(['reclaim'], { home, gitRoot });

  assert.deepEqual(readdirSync(cache), ['blob'], '--deep is required to touch the shared cache');
});

test('the harness refuses to run against the real HOME', () => {
  // Not a test of disk-guard — a test of this file. reclaim --deep deletes the
  // cargo cache under $HOME and removes worktrees under $DISK_GUARD_GIT_ROOT,
  // so a future edit that forgets to pass a temp home must fail loudly rather
  // than quietly reaching into the developer's actual machine.
  assert.throws(() => runGuard(['reclaim', '--deep'], { home: homedir() }), /refusing to run/);
  assert.throws(() => runGuard(['reclaim', '--deep'], {}), /refusing to run/);
});

test('an unknown mode exits 64 with usage', (t) => {
  const r = runGuard(['wat'], { home: tempHome(t) });
  assert.equal(r.code, 64);
  assert.match(r.stderr, /usage: disk-guard\.sh/);
});
