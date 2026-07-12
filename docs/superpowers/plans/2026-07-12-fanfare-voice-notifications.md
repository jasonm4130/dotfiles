# Fanfare Voice Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace/augment the Claude Code chime with pre-generated ElevenLabs voice clips — epic-trailer "I'M DOOONE!" on Stop, "I REQUIRE YOUR GUIDANCE!" on permission/needs-input.

**Architecture:** A one-time generation script (`fanfare-generate.mjs`) renders phrases from a chezmoi-managed `phrases.json` into MP3 clips under `~/.claude/sounds/fanfare/{stop,input}/`. The existing `tab-title.mjs` hook picks a random clip per event and plays it via `afplay`, failing open to legacy behavior (Glass.aiff chime for input events, silence for Stop) whenever clips are missing.

**Tech Stack:** Node 20 stdlib only (fetch, crypto, fs), chezmoi, `op`/`op-fast` for the API key, ElevenLabs TTS v1 API, `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-12-fanfare-voice-notifications-design.md`. Two deliberate refinements vs spec wording, made for testability: (1) playback goes through a `CLAUDE_FANFARE_PLAYER` env seam (defaults to `afplay`, darwin-only when unset) so tests can observe what would play; (2) the chorus-guard lockfile path is overridable via `CLAUDE_FANFARE_LOCK` (default `os.tmpdir()/claude-fanfare.lock`) so tests are isolated. Also the generator keeps its `.mjs` extension (`~/.local/bin/fanfare-generate.mjs`) so tests can import its pure functions.

## Global Constraints

- ESM `.mjs` only; Node 20 stdlib only — no `package.json`, no third-party deps.
- `// @ts-check` at top of every script, JSDoc typedefs for payload shapes.
- Hook must NEVER fail loudly: any error → legacy behavior or silence, exit 0.
- `CLAUDE_TAB_TITLE_SILENT=1` disables ALL audio (existing tests depend on it).
- Use `path.join` for all paths; `os.tmpdir()`/`os.homedir()`, never literals.
- Tests: `node --test tests/` from the dotfiles repo root; test source files directly (like `HOOK_PATH` in `tests/tab-title.test.mjs`).
- Commit after each task; stage explicit paths only (never `git commit -a`).
- Never run `chezmoi apply` without showing `chezmoi diff` output first.

---

### Task 1: Hook — fanfare clip playback

**Files:**
- Modify: `private_dot_claude/hooks/tab-title.mjs`
- Test: `tests/tab-title.test.mjs` (extend)

**Interfaces:**
- Consumes: clip layout `<fanfare dir>/stop/*.mp3` and `<fanfare dir>/input/*.mp3` (produced later by Task 2's script; tests fabricate it with dummy files).
- Produces: env contract — `CLAUDE_FANFARE_DIR` (default `~/.claude/sounds/fanfare`), `CLAUDE_FANFARE_PLAYER` (default `afplay`, darwin-gated when unset), `CLAUDE_FANFARE_LOCK` (default `os.tmpdir()/claude-fanfare.lock`), 2000 ms debounce.

- [x] **Step 1: Write the failing tests**

Append to `tests/tab-title.test.mjs`:

```js
// --- Fanfare voice clips ---

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync, existsSync } from 'node:fs';
import os from 'node:os';

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
```

(Merge the two import lines above into the file's existing import block — ESM imports belong at the top.)

- [x] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/tab-title.test.mjs`
Expected: the 7 new fanfare tests FAIL (no clip played / chime not routed through player override); the 9 existing tests still PASS.

- [x] **Step 3: Implement clip playback in the hook**

In `private_dot_claude/hooks/tab-title.mjs`, replace the imports block and `SOUND` constant:

```js
import { spawn } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ESC = '\u001b';
const BEL = '\u0007';
const CHIME = '/System/Library/Sounds/Glass.aiff';
const FANFARE_DEBOUNCE_MS = 2000;

/** Random .mp3 from `<fanfare dir>/<kind>/`, or null → caller fails open. */
function pickClip(kind) {
  try {
    const base = process.env.CLAUDE_FANFARE_DIR
      ?? path.join(os.homedir(), '.claude', 'sounds', 'fanfare');
    const dir = path.join(base, kind);
    const clips = readdirSync(dir).filter((f) => f.endsWith('.mp3'));
    if (clips.length === 0) return null;
    return path.join(dir, clips[Math.floor(Math.random() * clips.length)]);
  } catch {
    return null;
  }
}

/**
 * Chorus guard: parallel sessions finishing together shouldn't yell over
 * each other. True (skip) if another fanfare started < 2s ago; touches the
 * lockfile when clear to claim the slot.
 */
function fanfarePlayedRecently() {
  const lock = process.env.CLAUDE_FANFARE_LOCK
    ?? path.join(os.tmpdir(), 'claude-fanfare.lock');
  try {
    if (Date.now() - statSync(lock).mtimeMs < FANFARE_DEBOUNCE_MS) return true;
  } catch {}
  try {
    writeFileSync(lock, '');
  } catch {}
  return false;
}

/** Play a sound file, detached. CLAUDE_FANFARE_PLAYER overrides afplay (tests). */
function play(file) {
  const override = process.env.CLAUDE_FANFARE_PLAYER;
  if (!override && process.platform !== 'darwin') return;
  spawn(override || 'afplay', [file], { detached: true, stdio: 'ignore' }).unref();
}
```

Then in `main()`, replace the glyph/sound decision and the afplay block:

```js
  let glyph;
  let clipKind = null;
  let chime = false;
  if (event === 'Stop') {
    glyph = '✅';
    clipKind = 'stop';
  } else if (event === 'Notification') {
    if (type === 'permission_prompt' || type === 'agent_needs_input') {
      glyph = '⏸';
      clipKind = 'input';
      chime = true;
    } else if (type === 'idle_prompt') {
      glyph = '✅';
    }
  }
  if (!glyph) process.exit(0);

  if (process.env.CLAUDE_TAB_TITLE_SILENT !== '1') {
    const clip = clipKind === null ? null : pickClip(clipKind);
    if (clip !== null) {
      if (!fanfarePlayedRecently()) play(clip);
    } else if (chime) {
      play(CHIME);
    }
  }
```

Update the file's doc comment: the "Permission/needs-input also plays a short sound" paragraph becomes a short note that both Stop and needs-input play a random ElevenLabs clip from `~/.claude/sounds/fanfare/` when present (see `fanfare-generate.mjs`), falling back to the legacy chime/silence otherwise.

- [x] **Step 4: Run the full suite, verify green**

Run: `node --test tests/tab-title.test.mjs`
Expected: all 16 tests PASS (9 legacy + 7 new). The legacy chime test now exercises the `play()` seam, and Glass.aiff behavior is unchanged for real usage.

- [x] **Step 5: Commit**

```bash
git add private_dot_claude/hooks/tab-title.mjs tests/tab-title.test.mjs
git commit -m "feat(claude): fanfare voice clips in tab-title hook, fail-open to chime"
```

---

### Task 2: Phrase config + generation script

**Files:**
- Create: `private_dot_claude/sounds/fanfare/phrases.json`
- Create: `dot_local/bin/executable_fanfare-generate.mjs`
- Test: `tests/fanfare-generate.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1 (independent; shares only the on-disk layout convention `<fanfare dir>/{stop,input}/NN-<hash8>.mp3`).
- Produces: `clipFilename(index, phrase, voiceId, modelId) → string` and `planWork(phrases, existingNames, voiceId, modelId) → {generate: Array<{index, phrase, filename}>, rename: Array<{from, to}>, remove: string[]}`, exported from `executable_fanfare-generate.mjs`. CLI: `fanfare-generate.mjs [--list-voices]`.

- [x] **Step 1: Create the phrase config**

`private_dot_claude/sounds/fanfare/phrases.json` (voice_id intentionally empty — filled in Task 3):

```json
{
  "voice_id": "",
  "model_id": "eleven_multilingual_v2",
  "phrases": {
    "stop": [
      "I'M DOOONE!",
      "IT IS FINISHED.",
      "YOUR MOVE, HUMAN.",
      "THE DEED... IS DONE.",
      "MISSION. ACCOMPLISHED.",
      "BEHOLD! IT IS COMPLETE!"
    ],
    "input": [
      "I REQUIRE YOUR GUIDANCE!",
      "HUMAN! YOUR PERMISSION IS NEEDED!",
      "I AM... BLOCKED!",
      "A DECISION AWAITS, MORTAL!",
      "INPUT. REQUIRED."
    ]
  }
}
```

- [x] **Step 2: Write the failing tests**

`tests/fanfare-generate.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { clipFilename, planWork } = await import(
  path.join(__dirname, '..', 'dot_local', 'bin', 'executable_fanfare-generate.mjs')
);

const V = 'voiceA';
const M = 'eleven_multilingual_v2';

test('clipFilename: NN prefix + 8-hex hash, stable for same inputs', () => {
  const a = clipFilename(0, 'I AM DONE', V, M);
  assert.match(a, /^01-[0-9a-f]{8}\.mp3$/);
  assert.equal(a, clipFilename(0, 'I AM DONE', V, M));
  assert.notEqual(a.slice(3), clipFilename(0, 'I AM DONE', 'voiceB', M).slice(3));
});

test('planWork: empty dir → generate all, nothing renamed/removed', () => {
  const plan = planWork(['A', 'B'], [], V, M);
  assert.equal(plan.generate.length, 2);
  assert.deepEqual(plan.rename, []);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.generate.map((g) => g.phrase), ['A', 'B']);
});

test('planWork: unchanged → no work', () => {
  const existing = [clipFilename(0, 'A', V, M), clipFilename(1, 'B', V, M)];
  const plan = planWork(['A', 'B'], existing, V, M);
  assert.deepEqual([plan.generate, plan.rename, plan.remove], [[], [], []]);
});

test('planWork: edited phrase → old removed, new generated', () => {
  const existing = [clipFilename(0, 'A', V, M), clipFilename(1, 'B', V, M)];
  const plan = planWork(['A', 'B2'], existing, V, M);
  assert.deepEqual(plan.generate.map((g) => g.phrase), ['B2']);
  assert.deepEqual(plan.remove, [clipFilename(1, 'B', V, M)]);
});

test('planWork: reordered phrases → rename only, no regeneration', () => {
  const existing = [clipFilename(0, 'A', V, M), clipFilename(1, 'B', V, M)];
  const plan = planWork(['B', 'A'], existing, V, M);
  assert.deepEqual(plan.generate, []);
  assert.equal(plan.rename.length, 2);
  assert.deepEqual(plan.remove, []);
});

test('planWork: voice change → regenerate everything, remove old clips', () => {
  const existing = [clipFilename(0, 'A', V, M)];
  const plan = planWork(['A'], existing, 'voiceB', M);
  assert.equal(plan.generate.length, 1);
  assert.deepEqual(plan.remove, existing);
});

test('planWork: non-clip files are never removed', () => {
  const plan = planWork(['A'], ['notes.txt', 'cover.png'], V, M);
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.generate.length, 1);
});

test('planWork: stray mp3 not matching any phrase is removed', () => {
  const plan = planWork(['A'], ['99-00000000.mp3', clipFilename(0, 'A', V, M)], V, M);
  assert.deepEqual(plan.remove, ['99-00000000.mp3']);
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `node --test tests/fanfare-generate.test.mjs`
Expected: FAIL — `Cannot find module .../executable_fanfare-generate.mjs`.

- [x] **Step 4: Write the generation script**

`dot_local/bin/executable_fanfare-generate.mjs`:

```js
#!/usr/bin/env node
// @ts-check
/**
 * fanfare-generate — render ElevenLabs TTS clips for the tab-title hook.
 *
 * Reads <fanfare dir>/phrases.json (dir: $CLAUDE_FANFARE_DIR or
 * ~/.claude/sounds/fanfare) and writes <event>/NN-<hash8>.mp3 clips.
 * Idempotent: unchanged phrases are kept, reordered ones renamed, edited
 * ones regenerated, orphaned clips deleted. Run --list-voices first to
 * pick a voice_id.
 *
 * API key: $ELEVENLABS_API_KEY, else `op-fast read` / `op read` of OP_ITEM.
 * Fails loudly — this is an interactive tool, unlike the fail-open hook.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const OP_ITEM = 'op://Private/elevenlabs/credential';
const API = 'https://api.elevenlabs.io/v1';

/** @param {string} phrase @param {string} voiceId @param {string} modelId */
function clipHash(phrase, voiceId, modelId) {
  return createHash('sha256').update(`${voiceId}|${modelId}|${phrase}`).digest('hex').slice(0, 8);
}

/** @param {number} index @param {string} phrase @param {string} voiceId @param {string} modelId */
export function clipFilename(index, phrase, voiceId, modelId) {
  return `${String(index + 1).padStart(2, '0')}-${clipHash(phrase, voiceId, modelId)}.mp3`;
}

/**
 * Diff desired clips for one event dir against what exists.
 * Matching is by content hash, so reordering renames instead of regenerating.
 * @param {string[]} phrases
 * @param {string[]} existingNames
 * @param {string} voiceId
 * @param {string} modelId
 * @returns {{generate: {index: number, phrase: string, filename: string}[], rename: {from: string, to: string}[], remove: string[]}}
 */
export function planWork(phrases, existingNames, voiceId, modelId) {
  const byHash = new Map();
  for (const name of existingNames) {
    const m = name.match(/^\d{2}-([0-9a-f]{8})\.mp3$/);
    if (m) byHash.set(m[1], name);
  }
  const generate = [];
  const rename = [];
  const consumed = new Set();
  phrases.forEach((phrase, index) => {
    const filename = clipFilename(index, phrase, voiceId, modelId);
    const existing = byHash.get(clipHash(phrase, voiceId, modelId));
    if (existing !== undefined && !consumed.has(existing)) {
      consumed.add(existing);
      if (existing !== filename) rename.push({ from: existing, to: filename });
    } else {
      generate.push({ index, phrase, filename });
    }
  });
  const remove = existingNames.filter((n) => n.endsWith('.mp3') && !consumed.has(n));
  return { generate, rename, remove };
}

function fanfareDir() {
  return process.env.CLAUDE_FANFARE_DIR ?? path.join(os.homedir(), '.claude', 'sounds', 'fanfare');
}

/** @returns {string} */
function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  for (const bin of ['op-fast', 'op']) {
    const res = spawnSync(bin, ['read', OP_ITEM], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) return res.stdout.trim();
  }
  console.error(`No key: set ELEVENLABS_API_KEY or create ${OP_ITEM} in 1Password.`);
  process.exit(1);
}

/** @param {string} key */
async function listVoices(key) {
  const res = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`GET /voices → ${res.status}: ${await res.text()}`);
  const { voices } = await res.json();
  for (const v of voices) {
    const labels = Object.values(v.labels ?? {}).join(', ');
    console.log(`${v.voice_id}  ${v.name}${labels ? `  (${labels})` : ''}`);
  }
  console.log('\nSet your pick as "voice_id" in', path.join(fanfareDir(), 'phrases.json'));
}

/** @param {string} key */
async function generate(key) {
  const dir = fanfareDir();
  const config = JSON.parse(readFileSync(path.join(dir, 'phrases.json'), 'utf8'));
  const { voice_id: voiceId, model_id: modelId, phrases } = config;
  if (typeof voiceId !== 'string' || voiceId.length === 0) {
    console.error('phrases.json has no voice_id — run with --list-voices and pick one.');
    process.exit(1);
  }
  let generated = 0;
  for (const [kind, lines] of Object.entries(phrases)) {
    const kindDir = path.join(dir, kind);
    mkdirSync(kindDir, { recursive: true });
    const plan = planWork(lines, readdirSync(kindDir), voiceId, modelId);
    for (const { from, to } of plan.rename) {
      renameSync(path.join(kindDir, from), path.join(kindDir, to));
      console.log(`renamed  ${kind}/${from} → ${to}`);
    }
    for (const name of plan.remove) {
      rmSync(path.join(kindDir, name));
      console.log(`removed  ${kind}/${name}`);
    }
    for (const { phrase, filename } of plan.generate) {
      const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ text: phrase, model_id: modelId }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status} for "${phrase}": ${await res.text()}`);
      writeFileSync(path.join(kindDir, filename), Buffer.from(await res.arrayBuffer()));
      console.log(`created  ${kind}/${filename}  "${phrase}"`);
      generated++;
    }
  }
  console.log(`\nDone (${generated} new clip${generated === 1 ? '' : 's'}).`);
  console.log(`Persist to dotfiles:  chezmoi add ${dir}`);
}

async function main() {
  const key = apiKey();
  if (process.argv.includes('--list-voices')) await listVoices(key);
  else await generate(key);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `node --test tests/fanfare-generate.test.mjs`
Expected: all 8 tests PASS. Then run the whole suite: `node --test tests/` — everything green.

- [x] **Step 6: Commit**

```bash
git add private_dot_claude/sounds/fanfare/phrases.json \
        dot_local/bin/executable_fanfare-generate.mjs \
        tests/fanfare-generate.test.mjs
git commit -m "feat(claude): fanfare-generate script + phrase pack for voice clips"
```

---

### Task 3: Generate clips and go live (interactive)

This task needs the human: 1Password item, voice taste, credit spend, `chezmoi apply`.

**Files:**
- Generated: `~/.claude/sounds/fanfare/{stop,input}/*.mp3` → `chezmoi add` → `private_dot_claude/sounds/fanfare/`
- Modify: `private_dot_claude/sounds/fanfare/phrases.json` (fill `voice_id`)

**Interfaces:**
- Consumes: Task 1's hook (already reads clips), Task 2's script and config.
- Produces: the live clip library; the feature is DONE after this task.

- [x] **Step 1: Apply the managed files**

Run: `chezmoi diff` — review; expected: only the tab-title.mjs change, the new phrases.json, and the new fanfare-generate.mjs. Then: `chezmoi apply` (ask Jason if anything unexpected appears in the diff).

- [x] **Step 2: Confirm the 1Password item**

Run: `op-fast read op://Private/elevenlabs/credential` (falls back: `op read …`).
If the item doesn't exist, ask Jason for the real item path (update `OP_ITEM` in the script if it differs) or have him create it: `op item create --category "API Credential" --title elevenlabs credential=<key>`.

- [x] **Step 3: Pick the voice**

Run: `fanfare-generate.mjs --list-voices`
Show Jason the list; he picks a deep trailer-style voice (his ElevenLabs library choice). Write the chosen id into `voice_id` in `~/.claude/sounds/fanfare/phrases.json` AND mirror it back to the chezmoi source copy.

- [x] **Step 4: Generate and audition**

Run: `fanfare-generate.mjs`
Expected: 11 `created` lines, no errors. Audition: `afplay ~/.claude/sounds/fanfare/stop/01-*.mp3`. If the delivery is flat, tweak phrasing (ellipses/caps change ElevenLabs delivery) and re-run — only changed lines regenerate.

- [x] **Step 5: Persist clips + config to dotfiles**

```bash
chezmoi add ~/.claude/sounds/fanfare
cd "$(chezmoi source-path)"
git status --short   # verify: only fanfare files staged-to-be
git add private_dot_claude/sounds/fanfare
git commit -m "feat(claude): fanfare voice clips (generated, epic-trailer pack)"
```

- [x] **Step 6: Live smoke test**

In any Claude Code session, finish a turn → expect the voice on Stop; trigger a permission prompt → expect the "need you" line. Verify `CLAUDE_TAB_TITLE_SILENT=1` in env still silences (used by tests). If clips don't play: check `ls ~/.claude/sounds/fanfare/stop/` and hook errors via a manual pipe:
`echo '{"hook_event_name":"Stop","cwd":"'$PWD'"}' | node ~/.claude/hooks/tab-title.mjs`
