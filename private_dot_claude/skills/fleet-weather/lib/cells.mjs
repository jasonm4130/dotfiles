// The cell fitter: turns an RGB pixel buffer drawn at 2x4 pixels per terminal cell
// into one glyph, a foreground and a background per cell, chafa-style. Every glyph is
// a coverage map over the cell's sub-pixels (alpha 1 where its ink fills a sub-pixel,
// a fraction where an edge crosses it, 0 where it leaves the background), so a cell
// drawn with it shows alpha * fg + (1 - alpha) * bg in each sub-pixel. For each glyph
// the two colours that best reproduce the pixels are a closed-form least-squares
// solve, and the error is what they leave unexplained; the fitter takes the glyph with
// the least error.
//
// Glyph sets, finest first:
//   octant    2x4  U+1CD00 block (Unicode 16) and the older blocks it reuses
//   sextant   2x3  U+1FB00 block (Unicode 13)
//   extended  2x4  quadrant, plus the lower and left eighth blocks and the corner
//                  triangles ◢◣◤◥, all BMP and all drawn by Ghostty itself
//   quadrant  2x2  U+2596-U+259F, plus ▂ and ▆ so a horizontal edge keeps all four sub-rows
//   half      1x2  ▀, the original renderer's look
// Every set but half is overlaid with braille (U+2800, 2x4, one colour of dots on a
// background) where a thin line beats the block fit: the scene marks the pixels of its
// thin things (rigging, pennants, rain, spray, stars, lightning) and braille may draw
// only those, so the dots never fringe a sail or the sun.
//
// The extended set's coverage is Ghostty's own drawing (src/font/sprite/draw/block.zig
// and geometric_shapes.zig): an eighth block is a rectangle a whole number of eighths
// of the cell tall or wide (Ghostty rounds that to device pixels, a few percent at
// most), a corner triangle is the filled half-cell on one side of the cell's diagonal.
// Both are rasterised here onto the 2x4 grid by area, so an eighth block's edge lands
// mid-sub-pixel as a half-covered row or a quarter-covered column. Glyphs Ghostty
// strokes at the font's line thickness (the box-drawing diagonals ╱╲╳) or leaves to
// the font (◀▶▲▼, East Asian ambiguous width, two of them with emoji presentations)
// have no fixed coverage and are left out; the shades ░▒▓ fill the whole cell at one
// alpha, which a flat cell already draws.
//
// Claude Code's Raster takes only BMP code points (checked on 2.1.289: a sextant or
// octant cell refuses the whole tree, "beyond the Basic Multilingual Plane"; every
// extended glyph passes), so the band uses extended, quadrant or half
// (BMP_GLYPH_SETS); octant and sextant draw in preview.mjs, which writes straight to
// a terminal.
//
// Stability, within a frame: a choice that only noise separates from a simpler one
// would flip from frame to frame, so every glyph pays a small cost per edge it draws
// and braille a larger one, and a glyph displaces the one before it in the set's fixed
// order only by a margin; near-equal fits fall to the simplest, earliest glyph.
// Between frames (hysteresis): given the previous frame, a cell keeps its glyph and
// colours unless the new fit beats them on the new pixels by HOLD, so slow drift and
// noise leave it alone and only real change redraws it.
// Colours are quantised, coarser only when a frame would pass the Raster's 1024 pairs.

export const GLYPH_SETS = ["octant", "sextant", "extended", "quadrant", "half"];
/** The sets whose every glyph is a BMP code point: what Claude Code's Raster accepts. */
export const BMP_GLYPH_SETS = ["extended", "quadrant", "half"];
export const DEFAULT_GLYPHS = "extended";

/** Sub-pixels per cell in the buffer the scene draws. */
export const CELL_W = 2;
export const CELL_H = 4;

/** The Raster paints this many distinct colour pairs at once; a frame stays at or under it. */
export const PAIR_CAP = 1024;

/** Per edge a glyph draws between unlike sub-pixels: one pixel ~8 levels off. */
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
/**
 * What a new fit must beat the previous frame's cell by, on the new pixels, to replace
 * it: the cell's whole error at 6 levels RMS per channel, too little to see.
 */
export const HOLD = 3 * 8 * 6 * 6;
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

/**
 * The extended set's shapes beyond quadrant, as Ghostty draws them: an ink test on the
 * cell's unit square (x right, y down), in the order the fitter tries them.
 */
const rect = (x0, x1, y0, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
const EXTENDED = [
  [0x2581, rect(0, 1, 7 / 8, 1)], // ▁ lower one eighth
  [0x2583, rect(0, 1, 5 / 8, 1)], // ▃ lower three eighths
  [0x2585, rect(0, 1, 3 / 8, 1)], // ▅ lower five eighths
  [0x2587, rect(0, 1, 1 / 8, 1)], // ▇ lower seven eighths
  [0x258f, rect(0, 1 / 8, 0, 1)], // ▏ left one eighth
  [0x258e, rect(0, 2 / 8, 0, 1)], // ▎ left one quarter
  [0x258d, rect(0, 3 / 8, 0, 1)], // ▍ left three eighths
  [0x258b, rect(0, 5 / 8, 0, 1)], // ▋ left five eighths
  [0x258a, rect(0, 6 / 8, 0, 1)], // ▊ left three quarters
  [0x2589, rect(0, 7 / 8, 0, 1)], // ▉ left seven eighths
  [0x25e2, (x, y) => x + y >= 1], // ◢ lower right triangle (◤ is its complement)
  [0x25e3, (x, y) => y >= x], // ◣ lower left triangle (◥ is its complement)
];
/** Samples per sub-pixel side when rasterising a shape: eighth edges fall on a sample boundary. */
const SAMPLES = 16;

/** A shape's coverage of each sub-pixel of a gw x gh grid, by area. */
function rasterise(shape, gw, gh) {
  const alpha = new Float64Array(gw * gh);
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
    let inked = 0;
    for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) {
      if (shape((c + (sx + 0.5) / SAMPLES) / gw, (r + (sy + 0.5) / SAMPLES) / gh)) inked++;
    }
    alpha[r * gw + c] = inked / (SAMPLES * SAMPLES);
  }
  return alpha;
}

const maskAlpha = (mask, n) => Float64Array.from({ length: n }, (_, i) => (mask >> i) & 1);

/** Braille dot bits by sub-pixel (bit r*2+c of the 2x4 grid). */
const BRAILLE_DOT = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];
const brailleChar = (mask) => {
  let dots = 0;
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) dots |= BRAILLE_DOT[i];
  return String.fromCodePoint(0x2800 + dots);
};

const popcount = (m) => { let n = 0; for (; m; m &= m - 1) n++; return n; };

/** Edges a coverage map draws on a gw x gh grid: the coverage step between each pair of neighbours. */
function edges(alpha, gw, gh) {
  let n = 0;
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
    const a = alpha[r * gw + c];
    if (c + 1 < gw) n += Math.abs(a - alpha[r * gw + c + 1]);
    if (r + 1 < gh) n += Math.abs(a - alpha[(r + 1) * gw + c]);
  }
  return n;
}

/**
 * A glyph compiled for fitting: its coverage, the sub-pixels it touches, and the sums
 * the two-colour solve needs (A = sum alpha, Q = sum alpha^2, D the normal equations'
 * determinant).
 */
function part(ch, alpha, cost) {
  const n = alpha.length;
  let A = 0, Q = 0;
  const idx = [];
  for (let i = 0; i < n; i++) { A += alpha[i]; Q += alpha[i] * alpha[i]; if (alpha[i] > 0) idx.push(i); }
  return { ch, alpha, idx: Int8Array.from(idx), A, Q, D: Q * (n - 2 * A + Q) - (A - Q) * (A - Q), cost };
}

/**
 * A set compiled for fitting: one part per glyph shape (a shape and its complement are
 * one glyph with the colours swapped, so only the first is kept), and every glyph's
 * coverage by character, for holding a cell from the previous frame.
 * @param {[string, Float64Array][]} glyphs in the order the fitter tries them
 */
function compile(glyphs, gw, gh, braille) {
  const n = gw * gh;
  const key = (alpha) => Array.from(alpha, (a) => a.toFixed(4)).join(",");
  const seen = new Set();
  const parts = [];
  const coverage = new Map([[" ", new Float64Array(n)]]);
  for (const [ch, alpha] of glyphs) {
    coverage.set(ch, alpha);
    const k = key(alpha);
    if (seen.has(k) || seen.has(key(alpha.map((a) => 1 - a)))) continue;
    seen.add(k);
    parts.push(part(ch, alpha, EDGE_COST * edges(alpha, gw, gh)));
  }
  if (braille) for (const b of BRAILLE) coverage.set(b.ch, b.alpha);
  return { gw, gh, n, parts, braille, coverage };
}

const fromTable = (table, n) => [...table].map(([mask, cp]) => [String.fromCodePoint(cp), maskAlpha(mask, n)]);

const OCTANTS = octantTable();
const SEXTANTS = sextantTable();

const BRAILLE = [];
for (let m = 1; m < 255; m++) if (popcount(m) <= BRAILLE_DOTS) BRAILLE.push(part(brailleChar(m), maskAlpha(m, 8), BRAILLE_COST));

const SETS = {
  octant: compile(fromTable(OCTANTS, 8), 2, 4, true),
  sextant: compile(fromTable(SEXTANTS, 6), 2, 3, true),
  extended: compile([...fromTable(QUADRANT, 8), ...EXTENDED.map(([cp, shape]) => [String.fromCodePoint(cp), rasterise(shape, 2, 4)])], 2, 4, true),
  quadrant: compile(fromTable(QUADRANT, 8), 2, 4, true),
  half: compile(fromTable(new Map([[0x0f, 0x2580]]), 8), 2, 4, false),
};

/** Every glyph a set can put in a cell, braille included: what the tests hold frames to. */
export function glyphsOf(name) {
  const set = SETS[name] ?? SETS[DEFAULT_GLYPHS];
  const all = new Set([" ", ...set.parts.map((p) => p.ch)]);
  if (set.braille) for (const b of BRAILLE) all.add(b.ch);
  return all;
}

const EXTENDED_COVERAGE = new Map(EXTENDED.map(([cp, shape]) => [cp, rasterise(shape, 2, 4)]));
/** The complements the extended set draws by swapping colours: ▄ ▐ ◤ ◥ ▔ ▕ and the rest of the block. */
const COMPLEMENTS = [[0x2584, 0x2580], [0x2590, 0x258c], [0x25e4, 0x25e2], [0x25e5, 0x25e3], [0x2594, 0x2587], [0x2595, 0x2589]];

/**
 * What a glyph inks, for drawing a frame back to pixels: its coverage `alpha` on its
 * grid (2x4 or 2x3), `mask` where every sub-pixel is wholly in or out (undefined for an
 * eighth block or triangle), and whether it is braille (dots, not blocks). A space inks
 * nothing.
 * @returns {{ gw: number, gh: number, alpha: Float64Array, mask: number | undefined, braille: boolean } | undefined}
 */
export function inkOf(ch) {
  const ink = (gw, gh, alpha, braille = false) => {
    let mask = 0;
    for (let i = 0; i < alpha.length; i++) {
      if (alpha[i] !== 0 && alpha[i] !== 1) return { gw, gh, alpha, mask: undefined, braille };
      if (alpha[i] === 1) mask |= 1 << i;
    }
    return { gw, gh, alpha, mask, braille };
  };
  if (ch === " ") return ink(2, 4, new Float64Array(8));
  const cp = ch.codePointAt(0) ?? 0;
  if (cp > 0x2800 && cp <= 0x28ff) {
    let mask = 0;
    for (let i = 0; i < 8; i++) if ((cp - 0x2800) & BRAILLE_DOT[i]) mask |= 1 << i;
    return ink(2, 4, maskAlpha(mask, 8), true);
  }
  for (const [grid, table] of [[[2, 4], OCTANTS], [[2, 3], SEXTANTS]]) {
    for (const [mask, c] of table) if (c === cp) return ink(grid[0], grid[1], maskAlpha(mask, grid[0] * grid[1]));
  }
  const alpha = EXTENDED_COVERAGE.get(cp);
  if (alpha) return ink(2, 4, alpha);
  for (const [c, of] of COMPLEMENTS) {
    const base = EXTENDED_COVERAGE.get(of) ?? inkOf(String.fromCodePoint(of))?.alpha;
    if (c === cp && base) return ink(2, 4, base.map((a) => 1 - a));
  }
  return undefined;
}

const quantise = (c, step) => {
  const q = (v) => Math.min(255, Math.round(v / step) * step);
  return (q(c >> 16) << 16) | (q((c >> 8) & 255) << 8) | q(c & 255);
};

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Fits a pixel buffer to `columns` x `rows` cells.
 * @param {Int32Array | number[]} px RGB pixels, row-major, `columns * CELL_W` wide and `rows * CELL_H` tall
 * @param {number} columns
 * @param {number} rows
 * @param {string} [glyphs] one of GLYPH_SETS
 * @param {Uint8Array} [thin] per pixel, non-zero where the scene drew a thin line braille may stand for
 * @param {{ ch: string, fg: number, bg: number }[][]} [prev] the previous frame at the same size and
 *   set: a cell keeps its glyph and colours unless the new fit beats them by HOLD
 * @returns {{ ch: string, fg: number, bg: number }[][]}
 */
export function fitCells(px, columns, rows, glyphs = DEFAULT_GLYPHS, thin = undefined, prev = undefined) {
  const set = SETS[glyphs] ?? SETS[DEFAULT_GLYPHS];
  const pw = columns * CELL_W;
  const n = set.n;
  const R = new Float64Array(n), G = new Float64Array(n), B = new Float64Array(n);
  const raw = new Array(8);
  const held = prev?.length === rows && prev.every((line) => line?.length === columns) ? prev : undefined;
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
      // the best glyph so far: its error with and without its cost, and its colours
      let bestScore = flat, bestErr = flat, bestPart;
      let fr = sr / n, fg = sg / n, fb = sb / n, br = fr, bgg = fg, bb = fb;
      /** The exact error of colours (f, b) under a coverage map. */
      const exact = (alpha, f0, f1, f2, b0, b1, b2) => {
        let e = 0;
        for (let i = 0; i < n; i++) {
          const a = alpha[i], z = 1 - a;
          const d0 = a * f0 + z * b0 - R[i], d1 = a * f1 + z * b1 - G[i], d2 = a * f2 + z * b2 - B[i];
          e += d0 * d0 + d1 * d1 + d2 * d2;
        }
        return e;
      };
      /** Solves a glyph's two colours in closed form and takes it when it wins by the margin. */
      const consider = (p, margin) => {
        let ar = 0, ag = 0, ab = 0;
        for (let j = 0; j < p.idx.length; j++) { const i = p.idx[j], a = p.alpha[i]; ar += a * R[i]; ag += a * G[i]; ab += a * B[i]; }
        // normal equations: [Q, A-Q; A-Q, n-2A+Q] [f; b] = [sum a p; sum (1-a) p]
        const u = n - 2 * p.A + p.Q, v = p.A - p.Q, D = p.D;
        const cr = sr - ar, cg = sg - ag, cb = sb - ab;
        let f0 = (u * ar - v * cr) / D, f1 = (u * ag - v * cg) / D, f2 = (u * ab - v * cb) / D;
        let b0 = (p.Q * cr - v * ar) / D, b1 = (p.Q * cg - v * ag) / D, b2 = (p.Q * cb - v * ab) / D;
        let err = ssq - (f0 * ar + b0 * cr + f1 * ag + b1 * cg + f2 * ab + b2 * cb);
        if (f0 < 0 || f0 > 255 || f1 < 0 || f1 > 255 || f2 < 0 || f2 > 255 || b0 < 0 || b0 > 255 || b1 < 0 || b1 > 255 || b2 < 0 || b2 > 255) {
          // a fractional coverage can ask for colours past the gamut: score the ones the cell can show
          f0 = clamp255(f0); f1 = clamp255(f1); f2 = clamp255(f2); b0 = clamp255(b0); b1 = clamp255(b1); b2 = clamp255(b2);
          err = exact(p.alpha, f0, f1, f2, b0, b1, b2);
        }
        if (err + p.cost < bestScore - margin) {
          bestScore = err + p.cost; bestErr = err; bestPart = p;
          fr = f0; fg = f1; fb = f2; br = b0; bgg = b1; bb = b2;
        }
      };
      if (flat > EDGE_COST) {
        const margin = Math.max(MARGIN, MARGIN_SHARE * flat);
        for (const p of set.parts) consider(p, margin);
        // braille dots only where the scene drew a thin line, and only by a margin
        if (set.braille && lines !== 0 && n === 8 && bestScore > BRAILLE_COST) {
          for (const b of BRAILLE) {
            let mask = 0;
            for (let j = 0; j < b.idx.length; j++) mask |= 1 << b.idx[j];
            if ((mask & lines) === mask) consider(b, margin);
          }
        }
      }
      const rgb = (r, g, b) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
      const was = held?.[row][col];
      const wasAlpha = was && set.coverage.get(was.ch);
      if (wasAlpha) {
        // the previous frame's cell stands unless the new fit beats it by HOLD
        const f = was.fg, b = was.bg;
        if (exact(wasAlpha, f >> 16, (f >> 8) & 255, f & 255, b >> 16, (b >> 8) & 255, b & 255) - bestErr < HOLD) {
          line.push({ ch: was.ch, fg: f, bg: b, held: true });
          continue;
        }
      }
      if (bestPart === undefined) {
        const c = rgb(fr, fg, fb);
        line.push({ ch: " ", fg: c, bg: c });
      } else line.push({ ch: bestPart.ch, fg: rgb(fr, fg, fb), bg: rgb(br, bgg, bb) });
    }
    frame.push(line);
  }
  return finish(frame);
}

/**
 * Quantises colours, coarser until the frame is within PAIR_CAP distinct pairs. A held
 * cell is already quantised and passes through unchanged unless the step coarsens.
 */
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
