// The cell fitter: turns an RGB pixel buffer drawn at 2x4 pixels per terminal cell
// into one glyph, a foreground and a background per cell, chafa-style. Every glyph is a
// two-colour partition of the cell's sub-pixels, so for each partition the set offers
// the best colours are the means of its two halves and the error is what those means
// leave unexplained; the fitter takes the partition with the least error.
//
// Glyph sets, finest first:
//   octant    2x4  U+1CD00 block (Unicode 16) and the older blocks it reuses
//   sextant   2x3  U+1FB00 block (Unicode 13)
//   quadrant  2x2  U+2596-U+259F, plus ▂ and ▆ so a horizontal edge keeps all four sub-rows
//   half      1x2  ▀, the original renderer's look
// Every set but half is overlaid with braille (U+2800, 2x4, one colour of dots on a
// background) where a thin line beats the block fit: the scene marks the pixels of its
// thin things (rigging, pennants, rain, spray, stars, lightning) and braille may draw
// only those, so the dots never fringe a sail or the sun.
//
// Claude Code's Raster takes only BMP code points (checked on 2.1.289: a sextant or
// octant cell refuses the whole tree, "beyond the Basic Multilingual Plane"), so the
// band uses quadrant or half (BMP_GLYPH_SETS); octant and sextant draw in preview.mjs,
// which writes straight to a terminal.
//
// Stability: a choice that only noise separates from a simpler one would flip from
// frame to frame, so every partition pays a small cost per edge it draws and braille a
// larger one, and a glyph displaces the one before it in the set's fixed order only by
// a margin; near-equal fits fall to the simplest, earliest glyph, the same one every frame.
// Colours are quantised, coarser only when a frame would pass the Raster's 1024 pairs.

export const GLYPH_SETS = ["octant", "sextant", "quadrant", "half"];
/** The sets whose every glyph is a BMP code point: what Claude Code's Raster accepts. */
export const BMP_GLYPH_SETS = ["quadrant", "half"];
export const DEFAULT_GLYPHS = "quadrant";

/** Sub-pixels per cell in the buffer the scene draws. */
export const CELL_W = 2;
export const CELL_H = 4;

/** The Raster paints this many distinct colour pairs at once; a frame stays at or under it. */
export const PAIR_CAP = 1024;

/** Per edge a partition draws between unlike sub-pixels: one pixel ~8 levels off. */
const EDGE_COST = 3 * 8 * 8;
/**
 * What a later glyph must win by to displace an earlier one, at least half an edge and
 * 5% of the cell's variance: ties go the same way every frame, however sharp the cell.
 */
const MARGIN = EDGE_COST / 2;
const MARGIN_SHARE = 0.05;
/** What braille pays over a block glyph: its dots read lighter than the pixels they stand for. */
const BRAILLE_COST = 3000;
/** Braille stands in only for thin detail: at most this many dots. */
const BRAILLE_DOTS = 3;
const STEPS = [4, 8, 16, 32, 64];

/**
 * The glyph set for a setting (FLEET_WEATHER_GLYPHS): a set's name, singular or
 * plural, in any case; anything else is the default. `bmpOnly` folds the non-BMP sets
 * to the default, for the Raster.
 * @param {unknown} value
 * @param {{ bmpOnly?: boolean }} [opts]
 */
export function resolveGlyphs(value, { bmpOnly = false } = {}) {
  const named = typeof value === "string" ? value.trim().toLowerCase().replace(/s$/, "") : "";
  const set = GLYPH_SETS.includes(named) ? named : DEFAULT_GLYPHS;
  return bmpOnly && !BMP_GLYPH_SETS.includes(set) ? DEFAULT_GLYPHS : set;
}

// ---- glyph tables: a sub-pixel mask (bit r*gw+c set where the glyph's ink is) to a code point ----

/** Octant masks Unicode 16 left out because an older block already draws them. */
const OCTANT_REUSED = {
  0x01: 0x1cea8, 0x02: 0x1ceab, 0x03: 0x1fb82, 0x05: 0x2598, 0x0a: 0x259d, 0x0f: 0x2580, 0x14: 0x1fbe6,
  0x28: 0x1fbe7, 0x3f: 0x1fb85, 0x40: 0x1cea3, 0x50: 0x2596, 0x55: 0x258c, 0x5a: 0x259e, 0x5f: 0x259b,
  0x80: 0x1cea0, 0xa0: 0x2597, 0xa5: 0x259a, 0xaa: 0x2590, 0xaf: 0x259c, 0xc0: 0x2582, 0xf0: 0x2584,
  0xf5: 0x2599, 0xfa: 0x259f, 0xfc: 0x2586,
};

function octantTable() {
  const table = new Map();
  let next = 0x1cd00;
  for (let m = 1; m < 255; m++) table.set(m, OCTANT_REUSED[m] ?? next++);
  return table;
}

function sextantTable() {
  const table = new Map();
  for (let m = 1; m < 63; m++) table.set(m, m === 21 ? 0x258c : m === 42 ? 0x2590 : 0x1fb00 + m - 1 - (m > 21 ? 1 : 0) - (m > 42 ? 1 : 0));
  return table;
}

const QUADRANT = new Map([
  [0x05, 0x2598], [0x0a, 0x259d], [0x0f, 0x2580], [0x50, 0x2596], [0x55, 0x258c], [0x5a, 0x259e], [0x5f, 0x259b],
  [0xa0, 0x2597], [0xa5, 0x259a], [0xaf, 0x259c], [0xf5, 0x2599], [0xfa, 0x259f], [0xc0, 0x2582], [0xfc, 0x2586],
]);

/** Braille dot bits by sub-pixel (bit r*2+c of the 2x4 grid). */
const BRAILLE_DOT = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];
const brailleChar = (mask) => {
  let dots = 0;
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) dots |= BRAILLE_DOT[i];
  return String.fromCodePoint(0x2800 + dots);
};

const popcount = (m) => { let n = 0; for (; m; m &= m - 1) n++; return n; };

/** Edges between unlike neighbours a mask draws on a gw x gh grid. */
function edges(mask, gw, gh) {
  let n = 0;
  const at = (r, c) => (mask >> (r * gw + c)) & 1;
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
    if (c + 1 < gw && at(r, c) !== at(r, c + 1)) n++;
    if (r + 1 < gh && at(r, c) !== at(r + 1, c)) n++;
  }
  return n;
}

/**
 * A set compiled for fitting: one entry per partition (a mask and its complement are one
 * glyph with the colours swapped), its glyph, ink mask and edge cost.
 */
function compile(table, gw, gh) {
  const full = (1 << (gw * gh)) - 1;
  const seen = new Set();
  const parts = [];
  for (const [mask, cp] of table) {
    if (seen.has(mask) || seen.has(full ^ mask)) continue;
    seen.add(mask);
    parts.push({ mask, ch: String.fromCodePoint(cp), cost: EDGE_COST * edges(mask, gw, gh) });
  }
  return { gw, gh, n: gw * gh, parts };
}

const OCTANTS = octantTable();
const SEXTANTS = sextantTable();

const SETS = {
  octant: { ...compile(OCTANTS, 2, 4), braille: true },
  sextant: { ...compile(SEXTANTS, 2, 3), braille: true },
  quadrant: { ...compile(QUADRANT, 2, 4), braille: true },
  half: { ...compile(new Map([[0x0f, 0x2580]]), 2, 4), braille: false },
};

const BRAILLE = [];
for (let m = 1; m < 255; m++) if (popcount(m) <= BRAILLE_DOTS) BRAILLE.push({ mask: m, ch: brailleChar(m) });

/** Every glyph a set can put in a cell, braille included: what the tests hold frames to. */
export function glyphsOf(name) {
  const set = SETS[name] ?? SETS[DEFAULT_GLYPHS];
  const all = new Set([" ", ...set.parts.map((p) => p.ch)]);
  if (set.braille) for (const b of BRAILLE) all.add(b.ch);
  return all;
}

/**
 * What a glyph inks, for drawing a frame back to pixels: its mask on its grid (2x4 or
 * 2x3), and whether it is braille (dots, not blocks). A space inks nothing.
 * @returns {{ gw: number, gh: number, mask: number, braille: boolean } | undefined}
 */
export function inkOf(ch) {
  if (ch === " ") return { gw: 2, gh: 4, mask: 0, braille: false };
  const cp = ch.codePointAt(0) ?? 0;
  if (cp > 0x2800 && cp <= 0x28ff) {
    let mask = 0;
    for (let i = 0; i < 8; i++) if ((cp - 0x2800) & BRAILLE_DOT[i]) mask |= 1 << i;
    return { gw: 2, gh: 4, mask, braille: true };
  }
  for (const [grid, table] of [[[2, 4], OCTANTS], [[2, 3], SEXTANTS]]) {
    for (const [mask, c] of table) if (c === cp) return { gw: grid[0], gh: grid[1], mask, braille: false };
  }
  return undefined;
}

const quantise = (c, step) => {
  const q = (v) => Math.min(255, Math.round(v / step) * step);
  return (q(c >> 16) << 16) | (q((c >> 8) & 255) << 8) | q(c & 255);
};

/**
 * Fits a pixel buffer to `columns` x `rows` cells.
 * @param {Int32Array | number[]} px RGB pixels, row-major, `columns * CELL_W` wide and `rows * CELL_H` tall
 * @param {number} columns
 * @param {number} rows
 * @param {string} [glyphs] one of GLYPH_SETS
 * @param {Uint8Array} [thin] per pixel, non-zero where the scene drew a thin line braille may stand for
 * @returns {{ ch: string, fg: number, bg: number }[][]}
 */
export function fitCells(px, columns, rows, glyphs = DEFAULT_GLYPHS, thin = undefined) {
  const set = SETS[glyphs] ?? SETS[DEFAULT_GLYPHS];
  const pw = columns * CELL_W;
  const n = set.n;
  const R = new Float64Array(n), G = new Float64Array(n), B = new Float64Array(n);
  const raw = new Array(8);
  const frame = [];
  for (let row = 0; row < rows; row++) {
    const line = [];
    for (let col = 0; col < columns; col++) {
      // the cell's sub-pixels; a 2x3 set takes the 2x4 block area-weighted into thirds
      for (let i = 0; i < 8; i++) {
        const c = px[(row * CELL_H + (i >> 1)) * pw + col * CELL_W + (i & 1)];
        if (n === 8) { R[i] = c >> 16; G[i] = (c >> 8) & 255; B[i] = c & 255; } else raw[i] = c;
      }
      if (n === 6) {
        for (let k = 0; k < 2; k++) {
          const ch = (i, s) => (raw[i * 2 + k] >> s) & 255;
          for (const [s, out] of [[16, R], [8, G], [0, B]]) {
            out[k] = (3 * ch(0, s) + ch(1, s)) / 4;
            out[2 + k] = (ch(1, s) + ch(2, s)) / 2;
            out[4 + k] = (ch(2, s) + 3 * ch(3, s)) / 4;
          }
        }
      }
      let lines = 0;
      if (thin) for (let i = 0; i < 8; i++) if (thin[(row * CELL_H + (i >> 1)) * pw + col * CELL_W + (i & 1)]) lines |= 1 << i;
      let sr = 0, sg = 0, sb = 0, ssq = 0;
      for (let i = 0; i < n; i++) { sr += R[i]; sg += G[i]; sb += B[i]; ssq += R[i] * R[i] + G[i] * G[i] + B[i] * B[i]; }
      const flat = ssq - (sr * sr + sg * sg + sb * sb) / n;
      let best = { err: flat, ch: " ", mask: 0 };
      /** The error a partition leaves: what the means of its two sides do not explain. */
      const errOf = (mask) => {
        let ar = 0, ag = 0, ab = 0, na = 0;
        for (let i = 0; i < n; i++) if (mask & (1 << i)) { ar += R[i]; ag += G[i]; ab += B[i]; na++; }
        const nb = n - na, br = sr - ar, bgg = sg - ag, bb = sb - ab;
        return ssq - (ar * ar + ag * ag + ab * ab) / na - (br * br + bgg * bgg + bb * bb) / nb;
      };
      if (flat > EDGE_COST) {
        const margin = Math.max(MARGIN, MARGIN_SHARE * flat);
        for (const p of set.parts) {
          const err = errOf(p.mask) + p.cost;
          if (err < best.err - margin) best = { err, ch: p.ch, mask: p.mask };
        }
        // braille dots only where the scene drew a thin line, and only by a margin
        if (set.braille && lines !== 0 && n === 8 && best.err > BRAILLE_COST) {
          for (const b of BRAILLE) {
            if ((b.mask & lines) !== b.mask) continue;
            const err = errOf(b.mask) + BRAILLE_COST;
            if (err < best.err - margin) best = { err, ch: b.ch, mask: b.mask };
          }
        }
      }
      const mean = (mask, ink) => {
        let r = 0, g = 0, b = 0, k = 0;
        for (let i = 0; i < n; i++) if (((mask >> i) & 1) === ink) { r += R[i]; g += G[i]; b += B[i]; k++; }
        return (Math.round(r / k) << 16) | (Math.round(g / k) << 8) | Math.round(b / k);
      };
      if (best.mask === 0) {
        const c = (Math.round(sr / n) << 16) | (Math.round(sg / n) << 8) | Math.round(sb / n);
        line.push({ ch: " ", fg: c, bg: c });
      } else line.push({ ch: best.ch, fg: mean(best.mask, 1), bg: mean(best.mask, 0) });
    }
    frame.push(line);
  }
  return finish(frame);
}

/** Quantises colours, coarser until the frame is within PAIR_CAP distinct pairs. */
function finish(frame) {
  for (const step of STEPS) {
    const pairs = new Set();
    const out = frame.map((line) => line.map((c) => {
      const fg = quantise(c.fg, step), bg = quantise(c.bg, step);
      pairs.add(fg * 0x1000000 + bg);
      return { ch: c.ch === " " || fg === bg ? " " : c.ch, fg: c.ch === " " ? bg : fg, bg };
    }));
    if (pairs.size <= PAIR_CAP || step === STEPS[STEPS.length - 1]) return out;
  }
  return frame;
}
