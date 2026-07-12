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

const OP_ITEM = 'op://Private/elevenlabs-fanfare/credential';
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
  /** @type {{index: number, phrase: string, filename: string}[]} */
  const generate = [];
  /** @type {{from: string, to: string}[]} */
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
