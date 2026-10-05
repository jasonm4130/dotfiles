import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BLOCKED_STORM_MS, SUMMARY_STALE_MS, forecast, parseSummary, supervisionCooling, trackBlocked, watcherDown,
} from '../private_dot_claude/skills/fleet-weather/lib/weather.mjs';
import {
  DEFAULT_COLOR, SCENE_ROWS, SHIP_WIDTH, galleonPixels, paletteFamily, sceneFrame, track,
} from '../private_dot_claude/skills/fleet-weather/lib/galleon.mjs';
import { encodeBase64, packCells } from '../private_dot_claude/skills/fleet-weather/lib/pack.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOD = path.join(ROOT, 'private_dot_claude', 'skills', 'fleet-weather');

const NOW = 1791159267 * 1000;
/** A home summary as Firstmate publishes it, fresh at NOW, with overrides. */
const summary = (over = {}) => ({
  schema: 'fm-secondmate-home-summary.v1',
  generated_epoch: NOW / 1000,
  active_children: [{ id: 'crew-a', state: 'working', source: 'pane', doing: 'harness busy (claude-hook)' }],
  decisions_open: [],
  counts: { active_children: 1, decisions_open: 0 },
  ...over,
});

// ---- weather ----

test('parseSummary accepts only a home summary', () => {
  assert.equal(parseSummary(undefined), undefined);
  assert.equal(parseSummary('not json'), undefined);
  assert.equal(parseSummary('[]'), undefined);
  assert.equal(parseSummary('{"schema":"something-else.v1"}'), undefined);
  assert.deepEqual(parseSummary(JSON.stringify(summary())), summary());
});

test('no summary means no forecast, so the band draws nothing', () => {
  assert.equal(forecast({ summary: undefined, now: NOW }), undefined);
});

test('a healthy working fleet is calm, an idle one is night', () => {
  assert.deepEqual(forecast({ summary: summary(), now: NOW }), { weather: 'calm', reason: '1 crew working' });
  const two = summary({ counts: { active_children: 2 } });
  assert.equal(forecast({ summary: two, now: NOW }).reason, '2 crews working');
  const idle = summary({ active_children: [], counts: { active_children: 0 } });
  assert.deepEqual(forecast({ summary: idle, now: NOW }), { weather: 'night', reason: 'fleet idle' });
});

test('a decision or captain hold waiting on the captain is clouds', () => {
  for (const verb of ['needs-decision', 'captain-hold']) {
    const s = summary({ decisions_open: [{ id: 'endurebyte', key: 'eb-pr142-merge', verb }] });
    assert.deepEqual(forecast({ summary: s, now: NOW }), { weather: 'clouds', reason: 'endurebyte (eb-pr142-merge) needs a decision' });
  }
});

test('a failed or fixing validation is rain, and outranks clouds', () => {
  const failed = summary({
    active_children: [{ id: 'agentlens-m1', state: 'failed', doing: 'run failed' }],
    decisions_open: [{ id: 'x', key: 'k', verb: 'needs-decision' }],
  });
  assert.deepEqual(forecast({ summary: failed, now: NOW }), { weather: 'rain', reason: 'agentlens-m1 validation failed' });
  const fixing = summary({ active_children: [{ id: 'crew-b', state: 'working', doing: 'validating (fixing)' }] });
  assert.deepEqual(forecast({ summary: fixing, now: NOW }), { weather: 'rain', reason: 'crew-b fixing a red check' });
});

test('a fresh blocked decision storms, and decays to rain after two hours', () => {
  const blocked = { id: 'endurebyte', key: 'eb-gh-token-checks', verb: 'blocked' };
  const s = summary({ decisions_open: [blocked] });
  const key = 'endurebyte:eb-gh-token-checks';
  assert.equal(forecast({ summary: s, now: NOW }).weather, 'storm', 'never seen before counts as fresh');
  assert.deepEqual(
    forecast({ summary: s, now: NOW, firstSeen: { [key]: NOW - BLOCKED_STORM_MS + 1 } }),
    { weather: 'storm', reason: 'endurebyte (eb-gh-token-checks) blocked' },
  );
  assert.deepEqual(
    forecast({ summary: s, now: NOW, firstSeen: { [key]: NOW - BLOCKED_STORM_MS } }),
    { weather: 'rain', reason: 'endurebyte (eb-gh-token-checks) blocked for 2h+' },
  );
});

test('a blocked crew and unhealthy supervision storm with no decay', () => {
  const crew = summary({ active_children: [{ id: 'crew-c', state: 'blocked' }] });
  assert.deepEqual(forecast({ summary: crew, now: NOW }), { weather: 'storm', reason: 'crew-c blocked' });
  assert.deepEqual(
    forecast({ summary: summary(), health: 'key=x\nerrors=2\ncooldown=300\nretry_after=0\n', now: NOW }),
    { weather: 'storm', reason: 'supervision cooling down after engine errors' },
  );
  assert.deepEqual(forecast({ summary: summary(), watcher: 'pending:downtime:1.2.abc', now: NOW }), { weather: 'storm', reason: 'watcher down' });
  assert.equal(forecast({ summary: summary(), watcher: 'pending:handling:1.2.abc', now: NOW }).weather, 'calm', 'a wake being handled is not downtime');
  assert.equal(forecast({ summary: summary(), health: 'errors=0\ncooldown=0\n', now: NOW }).weather, 'calm');
});

test('a summary nobody republished for ten minutes storms', () => {
  assert.equal(forecast({ summary: summary(), now: NOW + SUMMARY_STALE_MS }).weather, 'calm');
  assert.deepEqual(forecast({ summary: summary(), now: NOW + SUMMARY_STALE_MS + 60000 }), { weather: 'storm', reason: 'fleet view not refreshed for 11 min' });
  const undated = summary();
  delete undated.generated_epoch;
  assert.equal(forecast({ summary: undated, now: NOW }).weather, 'storm');
});

test('several reasons show the first and a count', () => {
  const s = summary({
    decisions_open: [
      { id: 'a', key: 'k1', verb: 'blocked' },
      { id: 'b', key: 'k2', verb: 'blocked' },
    ],
    active_children: [{ id: 'c', state: 'blocked' }],
  });
  assert.equal(forecast({ summary: s, now: NOW }).reason, 'a (k1) blocked +2 more');
});

test('the live 2026-10-05 fleet reads as a storm', () => {
  const live = summary({
    decisions_open: [
      { id: 'endurebyte', key: 'eb-gh-token-checks', verb: 'blocked', source: 'status' },
      { id: 'endurebyte', key: 'eb-pr142-merge', verb: 'needs-decision', source: 'status' },
      { id: 'endurebyte', key: 'eb-tidy-watch-paths-doc-perm', verb: 'blocked', source: 'status' },
    ],
  });
  assert.equal(forecast({ summary: live, now: NOW }).weather, 'storm');
});

test('trackBlocked keeps first sightings, adds new ones and forgets closed ones', () => {
  const s = summary({ decisions_open: [{ id: 'a', key: 'k1', verb: 'blocked' }, { id: 'b', key: 'k2', verb: 'blocked' }, { id: 'c', key: 'k3', verb: 'needs-decision' }] });
  const seen = trackBlocked(s, { 'a:k1': NOW - 5000, 'gone:k': NOW - 9000, 'b:k2': NOW + 1 }, NOW);
  assert.deepEqual(seen, { 'a:k1': NOW - 5000, 'b:k2': NOW }, 'a future stamp is not trusted');
  assert.deepEqual(trackBlocked(undefined, { 'a:k1': 1 }, NOW), {});
});

test('sidecar parsers', () => {
  assert.equal(supervisionCooling(undefined), false);
  assert.equal(supervisionCooling('cooldown=0'), false);
  assert.equal(supervisionCooling('errors=3\ncooldown=600\n'), true);
  assert.equal(watcherDown('announced:downtime:9.9.x'), true);
  assert.equal(watcherDown('announced:handling:9.9.x'), false);
  assert.equal(watcherDown(undefined), false);
});

// ---- scene ----

const WEATHERS = ['calm', 'clouds', 'rain', 'storm', 'night'];

test('every frame is exactly width x 7 half-block cells under the 1024-pair palette', () => {
  for (const weather of WEATHERS) {
    for (const family of ['dark', 'light']) {
      for (const width of [1, 10, 35, 36, 37, 80, 158, 512]) {
        for (let t = 0; t < 70; t += 3) {
          const frame = sceneFrame(t, weather, family, width);
          assert.equal(frame.length, SCENE_ROWS);
          const pairs = new Set();
          for (const row of frame) {
            assert.equal(row.length, width);
            for (const cell of row) {
              assert.ok(cell.ch === ' ' || cell.ch === '▀', `glyph ${cell.ch}`);
              for (const c of [cell.fg, cell.bg]) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff, `colour ${c}`);
              pairs.add(`${cell.fg}:${cell.bg}`);
            }
          }
          assert.ok(pairs.size <= 1024, `${weather}/${family}/${width}@${t}: ${pairs.size} pairs`);
        }
      }
    }
  }
});

test('frames are deterministic per tick', () => {
  assert.deepEqual(sceneFrame(42, 'storm', 'dark', 80), sceneFrame(42, 'storm', 'dark', 80));
  assert.notDeepEqual(sceneFrame(1, 'calm', 'dark', 80), sceneFrame(2, 'calm', 'dark', 80));
});

test('the ship is in the scene and the palettes differ by family', () => {
  const hull = 0x7a4a2a;
  assert.ok(sceneFrame(0, 'calm', 'dark', 80).flat().some((c) => c.fg === hull || c.bg === hull));
  assert.notDeepEqual(sceneFrame(0, 'calm', 'dark', 80), sceneFrame(0, 'calm', 'light', 80));
});

test('the ship bounces and turns at both ends of its track', () => {
  const span = 80 - SHIP_WIDTH;
  assert.deepEqual(track(0, span), { pos: 0, dir: 1 });
  assert.deepEqual(track(span * 3, span), { pos: span, dir: -1 }, 'turned at the far end');
  assert.deepEqual(track(span * 3 - 1, span), { pos: span - 1, dir: 1 });
  assert.deepEqual(track(span * 6, span), { pos: 0, dir: 1 }, 'back home after a full lap');
  assert.deepEqual(track(99, 0), { pos: 0, dir: 1 }, 'no track when the row is narrower than the ship');
});

test('the rig answers the weather', () => {
  const sail = (w) => galleonPixels(w, 0).filter(([, , k]) => k === 'S' || k === 's' || k === 'W').length;
  assert.ok(sail('rain') < sail('calm'), 'topsails reefed in rain');
  assert.equal(sail('night'), 0, 'everything furled at night');
  assert.ok(sail('storm') < sail('rain'), 'jib struck in a storm, on top of the reefed topsails');
});

test('paletteFamily follows the theme prefix like Calm', () => {
  assert.equal(paletteFamily('dark-daltonized'), 'dark');
  assert.equal(paletteFamily('light'), 'light');
  assert.equal(paletteFamily('auto'), 'light');
  assert.equal(paletteFamily(undefined), 'light');
});

// ---- packing ----

test('packCells writes little-endian [codePoint, fg, bg] triplets, padded and clipped', () => {
  const frame = [[{ ch: '▀', fg: 0x112233, bg: 0x445566 }, { ch: 'x', fg: 1, bg: 2 }, { ch: 'y', fg: 3, bg: 4 }]];
  const { rows, cells } = packCells(frame, 2);
  assert.equal(rows, 1);
  const bytes = Buffer.from(cells, 'base64');
  assert.equal(bytes.length, 2 * 12, 'the third cell is clipped');
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => bytes.readUInt32LE(i * 4)), [0x2580, 0x112233, 0x445566, 0x78, 1, 2]);
  const padded = packCells([[]], 1);
  const pw = Buffer.from(padded.cells, 'base64');
  assert.deepEqual([pw.readUInt32LE(0), pw.readUInt32LE(4), pw.readUInt32LE(8)], [0x20, DEFAULT_COLOR, DEFAULT_COLOR]);
});

test('encodeBase64 matches standard padded base64', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 12, 13]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
    assert.equal(encodeBase64(bytes), Buffer.from(bytes).toString('base64'));
  }
});

// ---- plugin layout ----

test('the mod is a plugin chezmoi deploys to ~/.claude/skills/fleet-weather', () => {
  const manifest = JSON.parse(readFileSync(path.join(MOD, 'dot_claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'fleet-weather');
  const hooks = JSON.parse(readFileSync(path.join(MOD, 'hooks', 'hooks.json'), 'utf8'));
  assert.deepEqual(hooks.modules, ['./register.ts']);
  assert.ok(existsSync(path.join(MOD, 'hooks', 'register.ts')));
  assert.ok(!existsSync(path.join(MOD, 'SKILL.md')), 'no SKILL.md: it is a mod, not a skill');
  const ignore = readFileSync(path.join(ROOT, '.chezmoiignore'), 'utf8').split('\n');
  assert.ok(ignore.includes('!.claude/skills/fleet-weather/'));
  assert.ok(ignore.includes('!.claude/skills/fleet-weather/**/**'));
});

test('the hooks module only draws the band and never the working row', () => {
  const source = readFileSync(path.join(MOD, 'hooks', 'register.ts'), 'utf8');
  assert.match(source, /component: "AbovePrompt"/);
  assert.doesNotMatch(source, /component: "Spinner"/, 'Calm owns the Spinner; this mod must not contest it');
  assert.match(source, /\$\.env\.get\("FM_TASK_ID"\)/, 'workers are scoped out');
});
