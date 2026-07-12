import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(__dirname, '..', 'private_dot_claude', 'hooks', 'tab-title.mjs');

const ESC = '\u001b';
const BEL = '\u0007';

/** Spawn the hook with the given stdin payload (object gets JSON-stringified, string passed as-is). */
function runHook(stdinPayload) {
  const input = typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload);
  return spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_TAB_TITLE_SILENT: '1' },
  });
}

// --- Title stamping: attention states get ⏸, done states get ✅ ---

test('Notification permission_prompt → ⏸ + dir basename via terminalSequence', () => {
  const res = runHook({
    hook_event_name: 'Notification',
    notification_type: 'permission_prompt',
    cwd: '/Users/jasonmatthew/Work/Git/dotfiles',
  });
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.terminalSequence, `${ESC}]0;⏸ dotfiles${BEL}`);
});

test('Notification agent_needs_input → ⏸', () => {
  const res = runHook({
    hook_event_name: 'Notification',
    notification_type: 'agent_needs_input',
    cwd: '/Users/jasonmatthew/Work/Git/claude-skills',
  });
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.terminalSequence, `${ESC}]0;⏸ claude-skills${BEL}`);
});

test('Notification idle_prompt → ✅', () => {
  const res = runHook({
    hook_event_name: 'Notification',
    notification_type: 'idle_prompt',
    cwd: '/Users/jasonmatthew/Work/Git/dotfiles',
  });
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.terminalSequence, `${ESC}]0;✅ dotfiles${BEL}`);
});

test('Stop → ✅ + dir basename', () => {
  const res = runHook({
    hook_event_name: 'Stop',
    cwd: '/Users/jasonmatthew/Work/Git/dotfiles',
  });
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.terminalSequence, `${ESC}]0;✅ dotfiles${BEL}`);
});

test('worktree path uses the worktree dir name', () => {
  const res = runHook({
    hook_event_name: 'Stop',
    cwd: '/Users/jasonmatthew/Work/Git/dotfiles/.claude/worktrees/fix-titles',
  });
  const out = JSON.parse(res.stdout);
  assert.equal(out.terminalSequence, `${ESC}]0;✅ fix-titles${BEL}`);
});

// --- Fail-open: anything unexpected produces no output and exit 0 ---

test('missing cwd → no output, exit 0', () => {
  const res = runHook({ hook_event_name: 'Stop' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('malformed JSON stdin → no output, exit 0', () => {
  const res = runHook('{not json');
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('unknown notification_type → no output, exit 0', () => {
  const res = runHook({
    hook_event_name: 'Notification',
    notification_type: 'auth_success',
    cwd: '/Users/jasonmatthew/Work/Git/dotfiles',
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('unknown event → no output, exit 0', () => {
  const res = runHook({
    hook_event_name: 'PreToolUse',
    cwd: '/Users/jasonmatthew/Work/Git/dotfiles',
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

// --- Fanfare voice clips ---

/** Build a temp fanfare layout. events = {stop: n, input: n} clip counts. */
function makeFanfare(events) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fanfare-test-'));
  for (const [kind, count] of Object.entries(events)) {
    mkdirSync(path.join(dir, kind), { recursive: true });
    for (let i = 0; i < count; i++) {
      writeFileSync(path.join(dir, kind, `0${i + 1}-deadbeef.mp3`), '');
    }
  }
  const recordFile = path.join(dir, 'played.txt');
  const player = path.join(dir, 'player.sh');
  writeFileSync(player, `#!/bin/sh\necho "$1" >> "${recordFile}"\n`, { mode: 0o755 });
  return { dir, recordFile, player, lock: path.join(dir, 'lock') };
}

/** Run the hook with sound ENABLED and the fanfare env pointed at a temp layout. */
function runHookWithSound(stdinPayload, f, extraEnv = {}) {
  const env = {
    ...process.env,
    CLAUDE_FANFARE_DIR: f.dir,
    CLAUDE_FANFARE_PLAYER: f.player,
    CLAUDE_FANFARE_LOCK: f.lock,
    ...extraEnv,
  };
  delete env.CLAUDE_TAB_TITLE_SILENT;
  for (const [k, v] of Object.entries(extraEnv)) if (v === undefined) delete env[k];
  const input = typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload);
  return spawnSync(process.execPath, [HOOK_PATH], { input, encoding: 'utf8', env });
}

/** Poll for the recorder file (player is spawned detached; allow it a moment). */
async function playedClip(f, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      return readFileSync(f.recordFile, 'utf8').trim();
    } catch {
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  return null;
}

test('Stop with clips → plays a random stop clip', async () => {
  const f = makeFanfare({ stop: 3, input: 2 });
  const res = runHookWithSound({ hook_event_name: 'Stop', cwd: '/tmp/proj' }, f);
  assert.equal(res.status, 0);
  const clip = await playedClip(f);
  assert.ok(clip, 'expected a clip to be played');
  assert.ok(clip.startsWith(path.join(f.dir, 'stop') + path.sep), `clip from stop/: ${clip}`);
  assert.ok(clip.endsWith('.mp3'));
});

test('permission_prompt with clips → plays an input clip', async () => {
  const f = makeFanfare({ stop: 1, input: 2 });
  runHookWithSound(
    { hook_event_name: 'Notification', notification_type: 'permission_prompt', cwd: '/tmp/proj' },
    f,
  );
  const clip = await playedClip(f);
  assert.ok(clip && clip.startsWith(path.join(f.dir, 'input') + path.sep), `clip from input/: ${clip}`);
});

test('permission_prompt with NO clips → falls back to Glass.aiff chime', async () => {
  const f = makeFanfare({});
  runHookWithSound(
    { hook_event_name: 'Notification', notification_type: 'permission_prompt', cwd: '/tmp/proj' },
    f,
  );
  const clip = await playedClip(f);
  assert.equal(clip, '/System/Library/Sounds/Glass.aiff');
});

test('Stop with NO clips → silence (legacy), title still written', async () => {
  const f = makeFanfare({});
  const res = runHookWithSound({ hook_event_name: 'Stop', cwd: '/tmp/proj' }, f);
  assert.equal(JSON.parse(res.stdout).terminalSequence, `${ESC}]0;✅ proj${BEL}`);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(existsSync(f.recordFile), false);
});

test('chorus guard: fresh lockfile → voice skipped', async () => {
  const f = makeFanfare({ stop: 1 });
  writeFileSync(f.lock, '');
  runHookWithSound({ hook_event_name: 'Stop', cwd: '/tmp/proj' }, f);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(existsSync(f.recordFile), false);
});

test('chorus guard: stale lockfile → voice plays', async () => {
  const f = makeFanfare({ stop: 1 });
  writeFileSync(f.lock, '');
  const old = (Date.now() - 10_000) / 1000;
  utimesSync(f.lock, old, old);
  runHookWithSound({ hook_event_name: 'Stop', cwd: '/tmp/proj' }, f);
  assert.ok(await playedClip(f));
});

test('CLAUDE_TAB_TITLE_SILENT=1 suppresses fanfare clips too', async () => {
  const f = makeFanfare({ stop: 1 });
  runHookWithSound({ hook_event_name: 'Stop', cwd: '/tmp/proj' }, f, {
    CLAUDE_TAB_TITLE_SILENT: '1',
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(existsSync(f.recordFile), false);
});
