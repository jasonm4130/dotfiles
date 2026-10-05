import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BLOCKED_STORM_MS, SUMMARY_STALE_MS, forecast, parseSummary, supervisionCooling, trackBlocked, watcherDown,
} from '../private_dot_claude/skills/fleet-weather/lib/weather.mjs';
import {
  DEFAULT_COLOR, SCENE_ROWS, SHIP_WIDTH, VARIANTS, WEATHER, galleonPixels, paletteFamily, resolveVariant, sceneFrame, track,
} from '../private_dot_claude/skills/fleet-weather/lib/galleon.mjs';
import { makeSea } from '../private_dot_claude/skills/fleet-weather/lib/sea.mjs';
import { SAIL_KEYS } from '../private_dot_claude/skills/fleet-weather/lib/ships.mjs';
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

test('every frame is exactly width x 6 half-block cells under the 1024-pair palette', () => {
  let widest = 0;
  for (const variant of VARIANTS) {
    for (const weather of WEATHERS) {
      for (const family of ['dark', 'light']) {
        for (const width of [1, 10, 25, 26, 37, 80, 158, 512]) {
          for (let t = 0; t < 70; t += 7) {
            const frame = sceneFrame(t, weather, family, width, { seed: t * 31, variant });
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
            widest = Math.max(widest, pairs.size);
            assert.ok(pairs.size <= 1024, `${variant}/${weather}/${family}/${width}@${t}: ${pairs.size} pairs`);
          }
        }
      }
    }
  }
  assert.ok(widest <= 512, `comfortably under the cap: ${widest} pairs`);
});

test('the scene is 6 rows, down from the original 7, and no ship is wider than its box', () => {
  assert.equal(SCENE_ROWS, 6);
  assert.equal(SHIP_WIDTH, 26);
  for (const variant of VARIANTS) {
    for (const weather of WEATHERS) {
      const px = galleonPixels(weather, 0, variant);
      assert.ok(px.length > 0);
      for (const [x, y] of px) assert.ok(x >= 0 && x < SHIP_WIDTH && y >= 0 && y < 10, `${variant}/${weather}: (${x}, ${y}) outside the box`);
    }
  }
});

test('frames are deterministic per tick and seed', () => {
  assert.deepEqual(sceneFrame(42, 'storm', 'dark', 80), sceneFrame(42, 'storm', 'dark', 80));
  assert.deepEqual(sceneFrame(42, 'storm', 'dark', 80, { seed: 7, variant: 'junk' }), sceneFrame(42, 'storm', 'dark', 80, { seed: 7, variant: 'junk' }));
  assert.notDeepEqual(sceneFrame(1, 'calm', 'dark', 80), sceneFrame(2, 'calm', 'dark', 80));
  assert.notDeepEqual(sceneFrame(40, 'storm', 'dark', 80, { seed: 1 }), sceneFrame(40, 'storm', 'dark', 80, { seed: 2 }), 'a different seed is a different sea');
});

test('the ship is in the scene and the palettes differ by family', () => {
  const hull = 0x7a4a2a;
  assert.ok(sceneFrame(0, 'calm', 'dark', 80).flat().some((c) => c.fg === hull || c.bg === hull));
  assert.notDeepEqual(sceneFrame(0, 'calm', 'dark', 80), sceneFrame(0, 'calm', 'light', 80));
});

test('every variant draws its own ship in the scene', () => {
  const frames = VARIANTS.map((variant) => JSON.stringify(sceneFrame(30, 'calm', 'light', 60, { seed: 3, variant })));
  assert.equal(new Set(frames).size, VARIANTS.length);
  const keysOf = (variant) => new Set(galleonPixels('calm', 0, variant).map(([, , k]) => k));
  assert.ok(keysOf('junk').has('J') && !keysOf('galleon').has('J'));
  assert.ok(keysOf('schooner').has('n') && keysOf('sloop').has('E') && !keysOf('galleon').has('E'));
});

test('the ship bounces and turns at both ends of its track', () => {
  const span = 80 - SHIP_WIDTH;
  assert.deepEqual(track(0, span), { pos: 0, dir: 1 });
  assert.deepEqual(track(span * 3, span), { pos: span, dir: -1 }, 'turned at the far end');
  assert.deepEqual(track(span * 3 - 1, span), { pos: span - 1, dir: 1 });
  assert.deepEqual(track(span * 6, span), { pos: 0, dir: 1 }, 'back home after a full lap');
  assert.deepEqual(track(99, 0), { pos: 0, dir: 1 }, 'no track when the row is narrower than the ship');
});

test('every rig answers the weather', () => {
  const sail = (variant, w) => galleonPixels(w, 0, variant).filter(([, , k]) => SAIL_KEYS.includes(k)).length;
  for (const variant of VARIANTS) {
    assert.ok(sail(variant, 'rain') < sail(variant, 'calm'), `${variant}: reefed in rain`);
    assert.equal(sail(variant, 'clouds'), sail(variant, 'calm'), `${variant}: full sail in cloud`);
    assert.ok(sail(variant, 'storm') < sail(variant, 'rain'), `${variant}: a storm sail at most in a storm`);
    assert.ok(sail(variant, 'storm') > 0, `${variant}: never bare of cloth in a storm`);
    assert.equal(sail(variant, 'night'), 0, `${variant}: everything furled at night`);
  }
});

test('every ship has stern windows that light at night', () => {
  const lamp = 0xffb347;
  for (const variant of VARIANTS) {
    assert.ok(galleonPixels('night', 0, variant).some(([, , k]) => k === 'w'), `${variant} has windows`);
    // the ship rides one of the first columns of its track, so its stern lamp is in the frame
    const lit = sceneFrame(0, 'night', 'dark', 60, { seed: 1, variant }).flat().some((c) => c.fg === lamp || c.bg === lamp);
    assert.ok(lit, `${variant}: lamp lit at night`);
  }
});

test('resolveVariant honours a pin, else picks per seed and keeps it', () => {
  assert.equal(resolveVariant('junk', 5), 'junk');
  assert.equal(resolveVariant(' Sloop ', 5), 'sloop');
  for (const bad of [undefined, '', 'auto', 'dinghy', 7]) assert.ok(VARIANTS.includes(resolveVariant(bad, 9)));
  assert.equal(resolveVariant(undefined, 123456), resolveVariant('auto', 123456), 'the same seed keeps its ship');
  const seen = new Set(Array.from({ length: 200 }, (_, i) => resolveVariant(undefined, 1790000000000 + i * 977)));
  assert.equal(seen.size, VARIANTS.length, 'every ship turns up across sessions');
});

test('the sea never repeats on a visible period and is smooth in space and time', () => {
  const wx = { amp: 1.3, speed: 1.4, chop: 0.42, steep: 0.25, swell: [1, 0.7, 0.4] };
  const sea = makeSea(11, wx, 9);
  const profile = (t) => Array.from({ length: 96 }, (_, x) => sea.height(x, t));
  const base = profile(0);
  let nearest = Infinity;
  for (let t = 20; t <= 1500; t += 5) {
    const p = profile(t);
    nearest = Math.min(nearest, p.reduce((n, y, x) => n + Math.abs(y - base[x]), 0) / p.length);
  }
  assert.ok(nearest > 0.15, `the sea comes back no closer than ${nearest.toFixed(3)} px`);
  for (let t = 0; t < 300; t += 3) {
    const a = profile(t), b = profile(t + 1);
    for (let x = 1; x < 96; x++) {
      assert.ok(Math.abs(b[x] - a[x]) < 0.7, 'a column never leaps between ticks');
      assert.ok(Math.abs(a[x] - a[x - 1]) < 2.2, 'neighbouring columns stay close');
    }
  }
  const other = makeSea(12, wx, 9);
  assert.notDeepEqual(profile(10), Array.from({ length: 96 }, (_, x) => other.height(x, 10)), 'seeds differ');
});

test('the sea is calmer in calm and taller and steeper in a storm', () => {
  const stats = (weather) => {
    const sea = makeSea(5, WEATHER[weather], 9);
    let lo = Infinity, hi = -Infinity, steepest = 0;
    for (let t = 0; t < 400; t += 3) {
      for (let x = 0; x < 100; x++) {
        const y = sea.height(x, t);
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        steepest = Math.max(steepest, Math.abs(sea.height(x + 1, t) - y));
      }
    }
    return { range: hi - lo, steepest };
  };
  const order = ['calm', 'clouds', 'rain', 'storm'].map(stats);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].range > order[i - 1].range, `swell grows with the weather (${i})`);
    assert.ok(order[i].steepest > order[i - 1].steepest, `and steepens (${i})`);
  }
  assert.ok(stats('night').range < stats('calm').range, 'night is the stillest sea');
});

test('whitecaps come with the weather and the sea does not flicker', () => {
  const foamCells = (weather, foam) => {
    let n = 0;
    for (let t = 0; t < 280; t += 4) for (const row of sceneFrame(t, weather, 'dark', 120, { seed: 4 })) for (const c of row) if (c.fg === foam || c.bg === foam) n++;
    return n;
  };
  assert.ok(foamCells('storm', 0xb3bdd6) > 0, 'a storm breaks white');
  assert.ok(foamCells('storm', 0xb3bdd6) > foamCells('calm', 0xe3f2fd), 'more whitecaps in a storm than in a calm');
  // a cell that changes and changes straight back is flicker; the wave field does not do it
  for (const weather of ['calm', 'clouds', 'night']) {
    let back = 0, total = 0;
    for (let t = 1; t < 200; t++) {
      const [a, b, c] = [t - 1, t, t + 1].map((k) => sceneFrame(k, weather, 'dark', 100, { seed: 2, variant: 'sloop' })[4]);
      for (let x = 0; x < 100; x++) {
        const key = (row) => `${row[x].fg}:${row[x].bg}`;
        total++;
        if (key(a) === key(c) && key(a) !== key(b)) back++;
      }
    }
    assert.ok(back / total < 0.02, `${weather}: ${((back / total) * 100).toFixed(2)}% of sea cells flicker`);
  }
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
