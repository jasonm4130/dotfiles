import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
