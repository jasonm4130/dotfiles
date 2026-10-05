import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BLOCKED_STORM_MS, SUMMARY_STALE_MS, forecast, parseSummary, supervisionCooling, trackBlocked, watcherDown,
} from '../private_dot_claude/skills/fleet-weather/lib/weather.mjs';
import {
  DEFAULT_COLOR, SCENE_ROWS, SHIP_WIDTH, VARIANTS, WEATHER, galleonPixels, layShip, paletteFamily, resolveVariant, sceneFrame, scenePixels, track,
} from '../private_dot_claude/skills/fleet-weather/lib/galleon.mjs';
import {
  BMP_GLYPH_SETS, CELL_H, CELL_W, DEFAULT_GLYPHS, GLYPH_SETS, HOLD, fitCells, glyphsOf, inkOf, resolveGlyphs,
} from '../private_dot_claude/skills/fleet-weather/lib/cells.mjs';
import { hash, makeSea } from '../private_dot_claude/skills/fleet-weather/lib/sea.mjs';
import { SAIL_KEYS, SHIP_HEIGHT } from '../private_dot_claude/skills/fleet-weather/lib/ships.mjs';
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
const rgbOf = (c) => [c >> 16, (c >> 8) & 255, c & 255];
const dist2 = (a, b) => rgbOf(a).reduce((n, v, i) => n + (v - rgbOf(b)[i]) ** 2, 0);

/** Two colours mixed by coverage `a` of the first, rounded per channel. */
const over = (f, b, a) => rgbOf(f).reduce((n, v, i) => (n << 8) | Math.round(a * v + (1 - a) * rgbOf(b)[i]), 0);

/**
 * A frame drawn back to its 2x4 pixels, as a terminal would show its glyphs averaged
 * over each sub-pixel (braille dots as solid).
 */
function redraw(frame) {
  const columns = frame[0].length;
  const px = new Int32Array(columns * CELL_W * frame.length * CELL_H);
  frame.forEach((row, r) => row.forEach((cell, c) => {
    const ink = inkOf(cell.ch);
    assert.ok(ink, `a glyph the fitter knows: U+${cell.ch.codePointAt(0).toString(16)}`);
    for (let i = 0; i < 8; i++) {
      const sx = i & 1, sy = i >> 1;
      const gy = Math.min(ink.gh - 1, Math.floor((sy * ink.gh) / CELL_H));
      px[(r * CELL_H + sy) * columns * CELL_W + c * CELL_W + sx] = over(cell.fg, cell.bg, ink.alpha[gy * ink.gw + sx]);
    }
  }));
  return px;
}
const meanError = (a, b) => a.reduce((n, c, i) => n + dist2(c, b[i]), 0) / a.length;

test('every frame is exactly width x 5 cells of its glyph set, width-1, under the 1024-pair palette', () => {
  let widest = 0;
  for (const glyphs of GLYPH_SETS) {
    const allowed = glyphsOf(glyphs);
    for (const variant of VARIANTS) {
      for (const weather of WEATHERS) {
        for (const family of ['dark', 'light']) {
          for (const width of [1, 10, 25, 37, 80, 158, 512]) {
            for (let t = 0; t < 70; t += 14) {
              const frame = sceneFrame(t, weather, family, width, { seed: t * 31, variant, glyphs });
              assert.equal(frame.length, SCENE_ROWS);
              const pairs = new Set();
              for (const row of frame) {
                assert.equal(row.length, width);
                for (const cell of row) {
                  assert.ok(allowed.has(cell.ch), `${glyphs}: glyph U+${cell.ch.codePointAt(0).toString(16)}`);
                  for (const c of [cell.fg, cell.bg]) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff, `colour ${c}`);
                  pairs.add(`${cell.fg}:${cell.bg}`);
                }
              }
              widest = Math.max(widest, pairs.size);
              assert.ok(pairs.size <= 1024, `${glyphs}/${variant}/${weather}/${family}/${width}@${t}: ${pairs.size} pairs`);
            }
          }
        }
      }
    }
  }
  assert.ok(widest <= 768, `comfortably under the cap: ${widest} pairs`);
});

test('each glyph set holds the glyphs it names, one code point each, BMP where the Raster needs it', () => {
  const sizes = Object.fromEntries(GLYPH_SETS.map((g) => [g, glyphsOf(g)]));
  const braille = (s) => [...s].filter((ch) => ch.codePointAt(0) >= 0x2800 && ch.codePointAt(0) <= 0x28ff).length;
  assert.deepEqual([...sizes.half], [' ', '▀'], 'half is the original renderer: a space or an upper half block');
  // seven quadrant partitions (a pattern and its inverse are one glyph, colours swapped) and two quarter-height ones
  assert.equal([...sizes.quadrant].filter((ch) => ch.codePointAt(0) >= 0x2580 && ch.codePointAt(0) <= 0x259f).length, 9);
  for (const ch of '▀▌▂▆') assert.ok(sizes.quadrant.has(ch), `quadrant has ${ch}`);
  for (const g of GLYPH_SETS) {
    for (const ch of sizes[g]) assert.equal([...ch].length, 1, `${g}: one code point`);
    if (g !== 'half') assert.ok(braille(sizes[g]) > 0, `${g} is overlaid with braille`);
  }
  for (const g of BMP_GLYPH_SETS) for (const ch of sizes[g]) assert.ok(ch.codePointAt(0) <= 0xffff, `${g}: ${ch} in the BMP`);
  // extended is quadrant plus the eighth blocks and corner triangles Ghostty draws itself;
  // a shape and its complement are one glyph, so ▄ ▐ ◤ ◥ ▔ ▕ come out as their partners
  for (const ch of sizes.quadrant) assert.ok(sizes.extended.has(ch), `extended keeps quadrant's ${ch}`);
  for (const ch of '▁▂▃▅▆▇▏▎▍▌▋▊▉◢◣') assert.ok(sizes.extended.has(ch), `extended has ${ch}`);
  for (const ch of '▄▐◤◥▔▕░▒▓╱╲╳◀▶▲▼') assert.ok(!sizes.extended.has(ch), `extended leaves out ${ch}`);
  assert.equal(sizes.extended.size - braille(sizes.extended), sizes.quadrant.size - braille(sizes.quadrant) + 12);
  // every Unicode 16 octant and every sextant is a distinct pattern on its grid
  for (const [first, last, gh] of [[0x1cd00, 0x1cde5, 4], [0x1fb00, 0x1fb3b, 3]]) {
    const masks = new Set();
    for (let cp = first; cp <= last; cp++) {
      const ink = inkOf(String.fromCodePoint(cp));
      assert.equal(ink?.gh, gh, `U+${cp.toString(16)}`);
      masks.add(ink.mask);
    }
    assert.equal(masks.size, last - first + 1);
  }
  // every 2x4 pattern has its octant glyph, each a different one
  const seen = new Map();
  for (const ch of sizes.octant) {
    const ink = inkOf(ch);
    if (ink.braille || ch === ' ') continue;
    assert.equal(ink.gh, 4);
    const key = Math.min(ink.mask, 255 ^ ink.mask);
    assert.ok(!seen.has(key) || seen.get(key) === ch, `one octant per pattern (${key})`);
    seen.set(key, ch);
  }
  assert.equal(seen.size, 127, 'all 254 two-colour patterns, as 127 glyph-and-colours pairs');
});

test('resolveGlyphs takes a set by name, defaults to extended and folds non-BMP sets for the Raster', () => {
  assert.equal(DEFAULT_GLYPHS, 'extended');
  assert.equal(resolveGlyphs('octant'), 'octant');
  assert.equal(resolveGlyphs(' Sextants '), 'sextant');
  assert.equal(resolveGlyphs('HALF'), 'half');
  assert.equal(resolveGlyphs('Quadrants'), 'quadrant');
  for (const bad of [undefined, '', 'braille', 7]) assert.equal(resolveGlyphs(bad), 'extended');
  assert.equal(resolveGlyphs('octant', { bmpOnly: true }), 'extended');
  assert.equal(resolveGlyphs('sextant', { bmpOnly: true }), 'extended');
  for (const kept of ['extended', 'quadrant', 'half']) assert.equal(resolveGlyphs(kept, { bmpOnly: true }), kept);
});

test('extended coverage is Ghostty\'s geometry by area on the 2x4 grid', () => {
  const alpha = (ch) => Array.from(inkOf(ch).alpha);
  // rows top to bottom, two sub-pixels each: an eighth block's edge halves a row or quarters a column
  assert.deepEqual(alpha('▁'), [0, 0, 0, 0, 0, 0, 0.5, 0.5]);
  assert.deepEqual(alpha('▃'), [0, 0, 0, 0, 0.5, 0.5, 1, 1]);
  assert.deepEqual(alpha('▇'), [0.5, 0.5, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(alpha('▏'), [0.25, 0, 0.25, 0, 0.25, 0, 0.25, 0]);
  assert.deepEqual(alpha('▋'), [1, 0.25, 1, 0.25, 1, 0.25, 1, 0.25]);
  assert.deepEqual(alpha('▔'), alpha('▇').map((a) => 1 - a), '▔ is ▇ with the colours swapped');
  // a corner triangle is half the cell, darker towards its corner, and ◤ is its complement
  const br = alpha('◢');
  assert.ok(Math.abs(br.reduce((n, a) => n + a, 0) - 4) < 1e-9);
  assert.ok(br[7] === 1 && br[0] === 0 && br[1] > 0 && br[1] < 0.5);
  assert.deepEqual(alpha('◤'), br.map((a) => 1 - a));
  for (const ch of '▁▂▃▅▆▇▏▎▍▋▊▉◢◣') assert.equal(inkOf(ch).mask, ch === '▂' || ch === '▆' ? inkOf(ch).mask : undefined, `${ch}: fractional unless it ends on a sub-pixel`);
});

test('the fitter reproduces any two-colour cell its set can draw, exactly', () => {
  const A = 0x204060, B = 0xe0c090;
  const cell = (mask) => Int32Array.from({ length: 8 }, (_, i) => ((mask >> i) & 1 ? A : B));
  for (let mask = 0; mask < 256; mask++) {
    const px = cell(mask);
    assert.deepEqual(redraw(fitCells(px, 1, 1, 'octant')), px, `octant ${mask}`);
  }
  const quadrants = [0x05, 0x0a, 0x50, 0xa0];
  for (let q = 0; q < 16; q++) {
    const mask = quadrants.reduce((m, bits, i) => ((q >> i) & 1 ? m | bits : m), 0);
    const px = cell(mask);
    assert.deepEqual(redraw(fitCells(px, 1, 1, 'quadrant')), px, `quadrant ${q}`);
  }
  for (const mask of [0xc0, 0xfc, 0x03, 0x3f]) assert.deepEqual(redraw(fitCells(cell(mask), 1, 1, 'quadrant')), cell(mask), 'quarter-height edges');
  for (let q = 0; q < 16; q++) {
    const mask = quadrants.reduce((m, bits, i) => ((q >> i) & 1 ? m | bits : m), 0);
    assert.deepEqual(redraw(fitCells(cell(mask), 1, 1, 'extended')), cell(mask), `extended keeps quadrant ${q}`);
  }
  // an edge at any eighth of the cell, or along its diagonal, as the pixels see it once
  // anti-aliased: every extended glyph's own coverage comes back to within a level
  for (const ch of '▁▃▅▇▏▎▍▋▊▉◢◣◤◥▔▕') {
    const px = Int32Array.from(inkOf(ch).alpha, (a) => over(A, B, a));
    const back = redraw(fitCells(px, 1, 1, 'extended'));
    px.forEach((c, i) => assert.ok(dist2(c, back[i]) <= 3, `${ch}: sub-pixel ${i}`));
  }
  assert.deepEqual(redraw(fitCells(cell(0x0f), 1, 1, 'half')), cell(0x0f));
  // the sextant set reproduces its own 2x3 grid: a top third over the rest
  const third = fitCells(Int32Array.from({ length: 8 }, (_, i) => (i < 2 ? A : B)), 1, 1, 'sextant')[0][0];
  assert.equal(inkOf(third.ch).gh, 3);
});

test('finer glyph sets draw the scene closer to its pixels', () => {
  const errors = Object.fromEntries(['half', 'quadrant', 'extended', 'octant'].map((g) => [g, 0]));
  for (const variant of VARIANTS) {
    for (const weather of WEATHERS) {
      const { px } = scenePixels(30, weather, 'dark', 60, { seed: 5, variant });
      for (const g of Object.keys(errors)) errors[g] += meanError(redraw(sceneFrame(30, weather, 'dark', 60, { seed: 5, variant, glyphs: g })), px);
    }
  }
  assert.ok(errors.octant < errors.quadrant * 0.75, `octant ${errors.octant.toFixed(0)} < quadrant ${errors.quadrant.toFixed(0)}`);
  assert.ok(errors.quadrant < errors.half * 0.75, `quadrant ${errors.quadrant.toFixed(0)} < half ${errors.half.toFixed(0)}`);
  // the band's default earns its place: eighths and wedges follow the anti-aliased edges quadrant cannot
  assert.ok(errors.extended < errors.quadrant * 0.95, `extended ${errors.extended.toFixed(0)} < quadrant ${errors.quadrant.toFixed(0)}`);
  assert.ok(errors.octant < errors.extended, `octant ${errors.octant.toFixed(0)} < extended ${errors.extended.toFixed(0)}`);
});

/** The share of cells whose glyph or colours differ between two frames. */
const churn = (a, b) => {
  let changed = 0, cells = 0;
  a.forEach((row, r) => row.forEach((c, x) => { cells++; if (c.ch !== b[r][x].ch || c.fg !== b[r][x].fg || c.bg !== b[r][x].bg) changed++; }));
  return changed / cells;
};

test('hysteresis: a static calm scene under pixel noise holds still', () => {
  // the same calm scene every frame, each pixel jittered by up to 3 levels a channel
  const { px, thin } = scenePixels(40, 'calm', 'dark', 100, { seed: 2 });
  const noisy = (k) => Int32Array.from(px, (c, i) => rgbOf(c).reduce((n, v, s) => (n << 8) | Math.max(0, Math.min(255, v + Math.floor(hash(k, i * 3 + s) * 7) - 3)), 0));
  for (const glyphs of ['quadrant', 'extended']) {
    let held, free, heldMax = 0, heldRate = 0, freeRate = 0;
    for (let k = 0; k < 30; k++) {
      const frame = noisy(k);
      const h = fitCells(frame, 100, SCENE_ROWS, glyphs, thin, held), f = fitCells(frame, 100, SCENE_ROWS, glyphs, thin);
      if (k > 0) { heldMax = Math.max(heldMax, churn(held, h)); heldRate += churn(held, h) / 29; freeRate += churn(free, f) / 29; }
      held = h; free = f;
    }
    assert.ok(heldMax < 0.02, `${glyphs}: at most ${(heldMax * 100).toFixed(2)}% of cells change in any frame with hysteresis`);
    assert.ok(heldRate < 0.005, `${glyphs}: ${(heldRate * 100).toFixed(2)}% of cells change per frame on average`);
    assert.ok(freeRate > 0.5, `${glyphs}: the noise alone would redraw ${(freeRate * 100).toFixed(0)}% a frame without it`);
  }
});

test('hysteresis: the animated calm redraws half as many cells, and a real change still redraws', () => {
  for (const glyphs of ['quadrant', 'extended']) {
    let held, free, heldRate = 0, freeRate = 0;
    for (let t = 0; t < 100; t++) {
      const h = sceneFrame(t, 'calm', 'dark', 100, { seed: 2, variant: 'sloop', glyphs, prev: held });
      const f = sceneFrame(t, 'calm', 'dark', 100, { seed: 2, variant: 'sloop', glyphs });
      if (t > 0) { heldRate += churn(held, h) / 99; freeRate += churn(free, f) / 99; }
      held = h; free = f;
    }
    assert.ok(heldRate < 0.25, `${glyphs}: ${(heldRate * 100).toFixed(1)}% of cells change per frame`);
    assert.ok(heldRate < freeRate * 0.7, `${glyphs}: ${(heldRate * 100).toFixed(1)}% held vs ${(freeRate * 100).toFixed(1)}% free`);
  }
  // a cell the new pixels have moved past HOLD from redraws to the new fit
  const A = 0x204060, B = 0xe0c090;
  const before = fitCells(Int32Array.from({ length: 8 }, (_, i) => (i < 4 ? A : B)), 1, 1, 'extended');
  const after = Int32Array.from({ length: 8 }, (_, i) => (i < 6 ? A : B));
  assert.deepEqual(fitCells(after, 1, 1, 'extended', undefined, before), fitCells(after, 1, 1, 'extended'));
  assert.ok(HOLD > 0);
  // and a previous frame of another size is ignored
  assert.deepEqual(fitCells(after, 1, 1, 'extended', undefined, [[...before[0], ...before[0]]]), fitCells(after, 1, 1, 'extended'));
});

test('braille draws only the thin lines the scene marks, and draws them', () => {
  const sky = 0x5fa8e8, rope = 0x3b2c22;
  // a diagonal rope across a flat sky: the blocks cannot follow it, the dots can
  const px = Int32Array.from({ length: 8 }, (_, i) => (i === 0 || i === 3 || i === 5 ? rope : sky));
  const marked = Uint8Array.from({ length: 8 }, (_, i) => (i === 0 || i === 3 || i === 5 ? 1 : 0));
  assert.ok(inkOf(fitCells(px, 1, 1, 'quadrant', marked)[0][0].ch).braille, 'a marked rope is braille');
  assert.ok(!inkOf(fitCells(px, 1, 1, 'quadrant')[0][0].ch).braille, 'unmarked, the same pixels are blocks');
  assert.ok(!inkOf(fitCells(px, 1, 1, 'half', marked)[0][0].ch).braille, 'half never uses braille');
  // in the scene: storm rain and rigging bring braille to quadrant (octant's blocks draw
  // them exactly), and never where nothing thin was drawn
  for (const glyphs of ['quadrant', 'octant']) {
    let dots = 0;
    for (let t = 0; t < 60; t += 6) {
      const { px: scene, thin } = scenePixels(t, 'storm', 'dark', 80, { seed: 3, variant: 'schooner' });
      const frame = fitCells(scene, 80, SCENE_ROWS, glyphs, thin);
      frame.forEach((row, r) => row.forEach((cell, c) => {
        const ink = inkOf(cell.ch);
        if (!ink.braille) return;
        dots++;
        for (let i = 0; i < 8; i++) if ((ink.mask >> i) & 1) assert.ok(thin[(r * CELL_H + (i >> 1)) * 160 + c * CELL_W + (i & 1)], `${glyphs}@${t}: a dot on a thin pixel`);
      }));
    }
    if (glyphs === 'quadrant') assert.ok(dots > 0, `${glyphs}: the storm's rain shows as braille`);
  }
});

test('near-equal fits do not flip: noise of a level or two never changes a cell\'s glyph', () => {
  for (const glyphs of GLYPH_SETS) {
    for (let k = 0; k < 40; k++) {
      // a smooth cell (a gentle gradient) and a sharp one (an edge), each jittered by +-2 levels
      const base = Array.from({ length: 8 }, (_, i) => (k % 2 === 0 ? 0x406080 + (i >> 1) * 0x020202 : (i >> 1) < 2 ? 0x204060 : 0xd0c0a0));
      const jitter = (seed) => Int32Array.from(base, (c, i) => c + (Math.floor(hash(seed, i) * 5) - 2) * 0x010101);
      const glyph = fitCells(jitter(k * 2), 1, 1, glyphs)[0][0].ch;
      assert.equal(fitCells(jitter(k * 2 + 1), 1, 1, glyphs)[0][0].ch, glyph, `${glyphs} #${k}`);
    }
  }
});

test('the scene is 5 rows and every ship 4 rows tall within its box', () => {
  assert.equal(SCENE_ROWS, 5);
  assert.equal(SHIP_HEIGHT, 4 * CELL_H);
  assert.equal(SHIP_WIDTH, 40);
  for (const variant of VARIANTS) {
    for (const weather of WEATHERS) {
      const px = galleonPixels(weather, 0, variant);
      assert.ok(px.length > 0);
      const ys = px.map(([, y]) => y);
      assert.ok(Math.max(...ys) - Math.min(...ys) >= 3 * CELL_H - 1, `${variant}/${weather}: at least three rows tall`);
      for (const [x, y] of px) assert.ok(x >= 0 && x < SHIP_WIDTH && y >= 0 && y < SHIP_HEIGHT, `${variant}/${weather}: (${x}, ${y}) outside the box`);
    }
  }
});

test('frames are deterministic per tick, seed and glyph set', () => {
  assert.deepEqual(sceneFrame(42, 'storm', 'dark', 80), sceneFrame(42, 'storm', 'dark', 80));
  const opts = { seed: 7, variant: 'junk', glyphs: 'octant' };
  assert.deepEqual(sceneFrame(42, 'storm', 'dark', 80, opts), sceneFrame(42, 'storm', 'dark', 80, { ...opts }));
  assert.deepEqual(sceneFrame(42, 'storm', 'dark', 80), sceneFrame(42, 'storm', 'dark', 80, { glyphs: 'extended' }), 'extended is the default');
  const prev = sceneFrame(41, 'storm', 'dark', 80, opts);
  assert.deepEqual(sceneFrame(42, 'storm', 'dark', 80, { ...opts, prev }), sceneFrame(42, 'storm', 'dark', 80, { ...opts, prev }), 'and per previous frame');
  assert.notDeepEqual(sceneFrame(1, 'calm', 'dark', 80), sceneFrame(2, 'calm', 'dark', 80));
  assert.notDeepEqual(sceneFrame(40, 'storm', 'dark', 80, { seed: 1 }), sceneFrame(40, 'storm', 'dark', 80, { seed: 2 }), 'a different seed is a different sea');
  assert.notDeepEqual(sceneFrame(40, 'calm', 'dark', 80, { glyphs: 'half' }), sceneFrame(40, 'calm', 'dark', 80, { glyphs: 'quadrant' }));
  assert.notDeepEqual(sceneFrame(40, 'calm', 'dark', 80, { glyphs: 'quadrant' }), sceneFrame(40, 'calm', 'dark', 80, { glyphs: 'extended' }));
});

test('the ship is in the scene and the palettes differ by family', () => {
  const hull = 0x7a4a2a;
  const { px, width, height } = scenePixels(0, 'calm', 'dark', 80);
  assert.equal(width, 160);
  assert.equal(height, 20);
  assert.ok(px.includes(hull));
  assert.ok(sceneFrame(0, 'calm', 'dark', 80).flat().some((c) => dist2(c.fg, hull) < 40 ** 2 || dist2(c.bg, hull) < 40 ** 2), 'and survives the fit');
  assert.notDeepEqual(sceneFrame(0, 'calm', 'dark', 80), sceneFrame(0, 'calm', 'light', 80));
});

test('every variant draws its own ship in the scene', () => {
  const frames = VARIANTS.map((variant) => JSON.stringify(sceneFrame(30, 'calm', 'light', 60, { seed: 3, variant })));
  assert.equal(new Set(frames).size, VARIANTS.length);
  const keysOf = (variant) => new Set(galleonPixels('calm', 0, variant).map(([, , k]) => k));
  assert.ok(keysOf('junk').has('J') && !keysOf('galleon').has('J'));
  assert.ok(keysOf('schooner').has('n') && keysOf('sloop').has('E') && !keysOf('galleon').has('E'));
  for (const variant of VARIANTS) assert.ok(keysOf(variant).has('r'), `${variant} is rigged`);
  assert.ok(keysOf('galleon').has('o') && keysOf('galleon').has('G'), 'the galleon has gunports and a gilded wale');
});

test('the ship bounces and turns at both ends of its track, half a pixel a tick', () => {
  const span = 160 - SHIP_WIDTH;
  assert.deepEqual(track(0, span), { pos: 0, dir: 1 });
  assert.deepEqual(track(1, span), { pos: 0.5, dir: 1 }, 'between pixels, not stepped');
  assert.deepEqual(track(span * 2, span), { pos: span, dir: -1 }, 'turned at the far end');
  assert.deepEqual(track(span * 2 - 1, span), { pos: span - 0.5, dir: 1 });
  assert.deepEqual(track(span * 2 + 1, span), { pos: span - 0.5, dir: -1 });
  assert.deepEqual(track(span * 4, span), { pos: 0, dir: 1 }, 'back home after a full lap');
  assert.deepEqual(track(99, 0), { pos: 0, dir: 1 }, 'no track when the row is narrower than the ship');
});

test('the ship is laid off the pixel grid with anti-aliased edges and a crisp interior', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  // one pixel at (3.5, 2.25) shares itself among four buffer pixels by area
  const one = layShip([[3.5, 2.25, 0xff0000, false]], 8, 8);
  assert.deepEqual(one.touched.sort((a, b) => a - b), [19, 20, 27, 28]);
  for (const [i, a] of [[19, 0.375], [20, 0.375], [27, 0.125], [28, 0.125]]) assert.ok(near(one.cover[i], a), `pixel ${i}: ${one.cover[i]}`);
  // a 3x3 block half a pixel off: its middle is wholly covered in its dominant colour, its rim partly
  const block = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) block.push([1.5 + x, 1 + y, x === 1 && y === 1 ? 0x00ff00 : 0x0000ff, false]);
  const laid = layShip(block, 8, 8);
  assert.ok(near(laid.cover[1 * 8 + 3], 1) && near(laid.cover[1 * 8 + 1], 0.5) && near(laid.cover[1 * 8 + 4], 0.5));
  assert.equal(laid.colour[2 * 8 + 3], 0x00ff00, 'half green, half blue: a tie keeps the first square laid there');
  assert.equal(laid.colour[1 * 8 + 3], 0x0000ff);
  const total = Array.from(laid.cover).reduce((n, a) => n + a, 0);
  assert.ok(near(total, 9), 'no area lost or doubled');
  // in the scene, a tick moves the ship half a pixel: frame t=1 is neither t=0 nor t=2
  for (const variant of VARIANTS) {
    const at = (t) => scenePixels(t, 'night', 'dark', 60, { seed: 1, variant }).px;
    assert.notDeepEqual(at(1), at(0));
    assert.notDeepEqual(at(1), at(2));
  }
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
    // the ship rides the first columns of its track, so its stern lamp is in the frame
    assert.ok(scenePixels(0, 'night', 'dark', 60, { seed: 1, variant }).px.includes(lamp), `${variant}: lamp lit at night`);
    // a lamp a pixel or two across shows whole when the ship's pixel grid meets the cells' and blurs between
    const lit = [0, 2, 4, 6].some((t) => sceneFrame(t, 'night', 'dark', 60, { seed: 1, variant }).flat().some((c) => dist2(c.fg, lamp) < 60 ** 2 || dist2(c.bg, lamp) < 60 ** 2));
    assert.ok(lit, `${variant}: and the band shows it`);
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
  const foamPixels = (weather, foam) => {
    let n = 0;
    for (let t = 0; t < 280; t += 4) for (const c of scenePixels(t, weather, 'dark', 120, { seed: 4 }).px) if (c === foam) n++;
    return n;
  };
  assert.ok(foamPixels('storm', 0xb3bdd6) > 0, 'a storm breaks white');
  assert.ok(foamPixels('storm', 0xb3bdd6) > foamPixels('calm', 0xe3f2fd), 'more whitecaps in a storm than in a calm');
  // a cell that changes and changes straight back is flicker; neither the wave field nor the fit does it
  for (const glyphs of ['quadrant', 'octant']) {
    for (const weather of ['calm', 'clouds', 'night']) {
      let back = 0, total = 0;
      const frames = Array.from({ length: 201 }, (_, t) => sceneFrame(t, weather, 'dark', 100, { seed: 2, variant: 'sloop', glyphs }));
      for (let t = 1; t < 200; t++) {
        for (const row of [3, 4]) {
          for (let x = 0; x < 100; x++) {
            const key = (k) => `${frames[k][row][x].ch}:${frames[k][row][x].fg}:${frames[k][row][x].bg}`;
            total++;
            if (key(t - 1) === key(t + 1) && key(t - 1) !== key(t)) back++;
          }
        }
      }
      assert.ok(back / total < 0.02, `${glyphs}/${weather}: ${((back / total) * 100).toFixed(2)}% of sea cells flicker`);
    }
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
