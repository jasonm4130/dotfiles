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
