// The fleet's four vessels, drawn as [x, y, colour key] pixels in a local box
// SHIP_HEIGHT rows tall at the scene's sub-cell resolution (2x4 pixels a terminal cell,
// so 16 rows is four cells), whose rows from WATERLINE down ride under the sea. Every
// ship faces right; the scene flips it to face its heading. Each is built from parts:
// a hull of rail, wale and planking with gunports or portholes and lit stern windows; masts
// and spars; standing rigging as one-pixel lines; sails filled as polygons and shaded
// from the lit leading edge into the belly; pennants that wave. The rig answers the
// weather: full sail in calm and cloud, reefed in rain, a storm sail in a storm and
// furled at night, when the stern windows light.

/** Pixel colours by key. */
export const SHIP = {
  f: "#d77757", M: "#4a2e1c", r: "#3b2c22", S: "#f4ecd8", s: "#c9b994", c: "#e2d6b8", W: "#fffaf0",
  R: "#5a3420", H: "#7a4a2a", P: "#8e5a34", h: "#4f2f1a", G: "#d9a441", o: "#2a1a10", w: "#ffcf70",
  b: "#bfa77a", F: "#cdbf98", L: "#ffb347", N: "#2c3e5c", n: "#1c2a42", u: "#bdb8a8", U: "#ece8dc",
  E: "#c44a3a", J: "#c0472e", j: "#6f2618", K: "#9c3823",
};

/** The keys that are sail cloth: what the rig tests count. */
export const SAIL_KEYS = "SscWJjK";

/** The local box's height in pixels: four terminal rows. */
export const SHIP_HEIGHT = 16;

/** The first local row under water. */
export const WATERLINE = 13;

export const VARIANTS = ["galleon", "schooner", "sloop", "junk"];

/** Rig levels: 0 full sail, 1 reefed (rain), 2 a storm sail (storm), 3 furled (night). */
const levelFor = (weather) => (weather === "night" ? 3 : weather === "storm" ? 2 : weather === "rain" ? 1 : 0);

/**
 * A hull: columns x0..x1, each from its deck row down to its bottom row. The deck row is
 * the rail, `wale` the row under it; `plank` names each lower row's key by its depth
 * under the rail (so planking can alternate); under the waterline it is `dark`.
 * `ports(x, y)` and `windows` ([x, y] pairs) break the planking.
 */
function hull(put, o) {
  const lit = new Set((o.windows ?? []).map(([x, y]) => y * 64 + x));
  for (let x = o.x0; x <= o.x1; x++) {
    const deck = o.deck(x), bottom = o.bottom(x);
    for (let y = deck; y <= bottom; y++) {
      let k = y === deck ? o.rail : y === deck + 1 ? o.wale : y >= WATERLINE ? o.dark : o.plank(y - deck);
      if (o.ports?.(x, y)) k = "o";
      if (lit.has(y * 64 + x)) k = "w";
      put(x, y, k);
    }
  }
}

/** A one-pixel line (Bresenham). */
function line(put, x0, y0, x1, y1, k) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(x0, y0, k);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const mast = (put, x, y0, y1) => line(put, x, y0, x, y1, "M");
const spar = (put, x0, x1, y, k = "M") => line(put, x0, y, x1, y, k);

/**
 * A filled polygon: every pixel whose centre is inside `pts`, keyed by `key(x, y)`.
 * @param {[number, number][]} pts
 */
function poly(put, pts, key) {
  const ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) put(x, y, key(x, y));
    }
  }
}

/**
 * A square sail hanging from a yard: rows y0..y1 between x0 and x1, the foot rounded
 * where the wind bellies it. Lit on the leading (right) edge, shaded aft into the belly.
 */
function square(put, x0, x1, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    const inset = y === y1 && y1 > y0 ? 1 : 0;
    for (let x = x0 + inset; x <= x1 - inset; x++) {
      const f = (x - x0) / Math.max(1, x1 - x0);
      put(x, y, x === x1 - inset ? "W" : f < 0.25 ? "s" : f < 0.5 || y === y1 ? "c" : "S");
    }
  }
}

/** Cloth shaded by distance from its luff at `lx`: lit there, shading towards the leech. */
const fore = (lx, span) => (x) => {
  const f = Math.abs(x - lx) / span;
  return f < 0.2 ? "W" : f < 0.55 ? "S" : f < 0.8 ? "c" : "s";
};

/** A furled sail: a bundle of cloth along a spar. */
const furl = (put, x0, x1, y) => spar(put, x0, x1, y, "F");

/** Pennants and flags: [x, y, length] each, streaming right and waving with the tick. */
function pennants(put, list, t) {
  for (const [x, y, len] of list) {
    for (let i = 0; i < len; i++) {
      const wave = i === 0 ? 0 : Math.round(0.5 + 0.5 * Math.sin(t * 0.8 - i * 1.1));
      put(x + i, y + wave, "f");
    }
  }
}

const galleon = {
  width: 40,
  stern: 2,
  bow: 34,
  build(put, lvl) {
    // standing rigging behind everything: backstay, stays between the masts, forestay to the bowsprit
    line(put, 8, 1, 1, 6, "r"); line(put, 8, 1, 19, 1, "r"); line(put, 19, 1, 28, 2, "r"); line(put, 28, 2, 39, 5, "r");
    line(put, 19, 2, 14, 8, "r"); line(put, 28, 3, 32, 7, "r");
    hull(put, {
      x0: 2, x1: 34, rail: "R", wale: "G", dark: "h",
      plank: (d) => (d % 2 === 0 ? "H" : "P"),
      deck: (x) => (x <= 9 ? 6 : x === 10 ? 7 : x >= 29 ? 7 : 8),
      bottom: (x) => [10, 12, 13, 14][x - 2] ?? [10, 11, 12, 13, 14][34 - x] ?? 15,
      ports: (x, y) => y === 10 && x >= 12 && x <= 27 && x % 3 === 0,
      windows: [[3, 8], [4, 8], [3, 9], [5, 8]],
    });
    put(1, 5, "w"); // stern lantern
    line(put, 34, 7, 39, 4, "b"); // bowsprit
    put(35, 8, "G"); // figurehead
    mast(put, 8, 1, 5); mast(put, 19, 0, 7); mast(put, 28, 1, 6);
    spar(put, 16, 22, 1); spar(put, 15, 23, 4); spar(put, 26, 30, 2); spar(put, 25, 31, 4);
    if (lvl === 0) { square(put, 16, 22, 2, 3); square(put, 26, 30, 3, 3); } else { furl(put, 16, 22, 2); furl(put, 26, 30, 3); }
    if (lvl <= 1) { square(put, 15, 23, 5, 7); square(put, 25, 31, 5, 6); }
    else if (lvl === 2) { square(put, 15, 23, 5, 6); furl(put, 25, 31, 5); }
    else { furl(put, 15, 23, 5); furl(put, 25, 31, 5); }
    if (lvl <= 2) poly(put, [[8, 2], [8, 6], [2, 6], [6, 2]], fore(8, 6)); // mizzen gaff
    else furl(put, 3, 7, 5);
    if (lvl <= 1) poly(put, [[29, 2], [38, 5.5], [30, 7]], fore(38, 9)); // jib
  },
  pennants: [[20, 0, 4], [29, 1, 3], [9, 1, 2]],
};

const schooner = {
  width: 40,
  stern: 2,
  bow: 34,
  build(put, lvl) {
    line(put, 13, 0, 2, 7, "r"); line(put, 13, 1, 24, 1, "r"); line(put, 24, 1, 39, 6, "r"); line(put, 24, 2, 32, 7, "r");
    hull(put, {
      x0: 2, x1: 34, rail: "u", wale: "E", dark: "n",
      plank: () => "N",
      deck: (x) => (x >= 30 ? 8 : 9),
      bottom: (x) => [10, 11, 12, 13, 14][x - 2] ?? [9, 9, 10, 11, 12, 13, 14][34 - x] ?? 15,
      windows: [[3, 10], [4, 10], [3, 11], [4, 11]],
    });
    put(2, 7, "w"); // stern lantern
    line(put, 34, 8, 39, 6, "b"); // bowsprit
    mast(put, 13, 0, 8); mast(put, 24, 1, 8);
    if (lvl <= 1) {
      const top = lvl === 0 ? 2 : 4;
      poly(put, [[12.5, top], [6, top - 1], [3, 8], [12.5, 8]], fore(12, 10)); // mainsail
      poly(put, [[23.5, top], [18, top - 1], [15, 8], [23.5, 8]], fore(23, 9)); // foresail
      line(put, 12, top, 6, top - 1, "b"); line(put, 23, top, 18, top - 1, "b"); // gaffs
    } else if (lvl === 2) poly(put, [[12.5, 5], [8, 8], [12.5, 8]], fore(12, 5)); // storm trysail
    else { furl(put, 4, 12, 7); furl(put, 16, 23, 7); }
    spar(put, 3, 12, 8, "b"); spar(put, 15, 23, 8, "b"); // booms
    if (lvl === 0) { poly(put, [[12.5, 0], [12.5, 1.5], [8, 1.5]], fore(12, 4)); poly(put, [[25, 2], [37, 6.5], [27, 8]], fore(37, 10)); }
    if (lvl <= 1) poly(put, [[24.5, 3], [31, 8], [25, 8]], fore(31, 6)); // staysail
  },
  pennants: [[14, 0, 3], [25, 1, 2]],
};

const sloop = {
  width: 30,
  stern: 2,
  bow: 25,
  build(put, lvl) {
    line(put, 12, 0, 1, 8, "r"); line(put, 12, 0, 29, 7, "r"); line(put, 12, 1, 15, 8, "r");
    hull(put, {
      x0: 2, x1: 25, rail: "u", wale: "N", dark: "E",
      plank: () => "U",
      deck: (x) => (x >= 22 ? 8 : 9),
      bottom: (x) => [10, 11, 12, 13, 14][x - 2] ?? [10, 11, 12, 13, 14][25 - x] ?? 15,
      ports: (x, y) => y === 11 && (x === 9 || x === 13 || x === 17),
      windows: [[3, 10], [4, 10], [3, 11], [4, 11]],
    });
    put(2, 8, "w"); // stern lantern
    line(put, 25, 8, 29, 7, "b"); // bowsprit
    mast(put, 12, 0, 8);
    if (lvl === 0) { poly(put, [[11.5, 1], [11.5, 8], [3, 8], [7, 4]], fore(11, 9)); poly(put, [[13, 1], [28, 7.5], [14, 8.5]], fore(28, 15)); }
    else if (lvl === 1) { poly(put, [[11.5, 3], [11.5, 8], [5, 8]], fore(11, 7)); poly(put, [[13, 4], [26, 7.5], [14, 8.5]], fore(26, 13)); }
    else if (lvl === 2) poly(put, [[11.5, 5], [11.5, 8], [8, 8]], fore(11, 4));
    else furl(put, 4, 11, 7);
    spar(put, 3, 11, 8, "b"); // boom
  },
  pennants: [[13, 0, 3]],
};

const junk = {
  width: 36,
  stern: 2,
  bow: 31,
  build(put, lvl) {
    line(put, 17, 0, 31, 7, "r"); line(put, 17, 0, 7, 1, "r");
    hull(put, {
      x0: 2, x1: 31, rail: "R", wale: "G", dark: "h",
      plank: (d) => (d % 2 === 0 ? "H" : "P"),
      deck: (x) => (x <= 7 ? 5 : x === 8 ? 6 : x === 9 ? 7 : x >= 28 ? 6 : x >= 26 ? 7 : 8),
      bottom: (x) => [9, 11, 12, 13, 14][x - 2] ?? [8, 9, 10, 11, 12, 13, 14][31 - x] ?? 15,
      windows: [[2, 7], [3, 7], [4, 7], [2, 8], [3, 8], [4, 8]],
    });
    put(28, 8, "U"); put(29, 8, "o"); // the bow's eye
    // battened lug sails: cloth panels between dark battens, the leech shaded
    const lug = (pts, y0, leech) => poly(put, pts, (x, y) => ((y - y0) % 2 === 1 ? "j" : x <= leech ? "K" : "J"));
    if (lvl <= 2) {
      const top = [1, 3, 5][lvl];
      lug([[12, top], [19, top], [20, 8], [9.5, 8]], top, 11);
    } else furl(put, 10, 19, 7);
    if (lvl <= 1) lug([[23, lvl === 0 ? 3 : 5], [28, lvl === 0 ? 3 : 5], [29, 7.5], [22, 7.5]], lvl === 0 ? 3 : 5, 23);
    else furl(put, 22, 28, 7);
    if (lvl <= 1) lug([[4, 1], [8, 1], [8.5, 5], [3, 5]], 1, 4);
    mast(put, 17, 0, 8); mast(put, 27, 2, 7); mast(put, 7, 1, 4);
  },
  pennants: [[18, 0, 3], [8, 0, 2]],
};

export const SHIPS = { galleon, schooner, sloop, junk };

/**
 * A ship in its local box, facing right, as [x, y, colour key] pixels.
 * @param {string} weather
 * @param {number} t tick
 * @param {string} [variant]
 */
export function shipPixels(weather, t, variant = "galleon") {
  const ship = SHIPS[variant] ?? galleon;
  const cells = new Map();
  const put = (x, y, k) => {
    if (x >= 0 && x < ship.width && y >= 0 && y < SHIP_HEIGHT) cells.set(y * 64 + x, [x, y, k]);
  };
  ship.build(put, levelFor(weather));
  pennants(put, ship.pennants, t);
  return [...cells.values()];
}

/**
 * The variant for a session: the pin when it names a ship, otherwise one chosen by the
 * seed, so a session keeps its ship for as long as it keeps its seed.
 * @param {unknown} pin
 * @param {number} seed
 */
export function resolveVariant(pin, seed) {
  const named = typeof pin === "string" ? pin.trim().toLowerCase() : "";
  if (VARIANTS.includes(named)) return named;
  return VARIANTS[Math.abs(Math.imul(seed | 0, 2654435761) >>> 8) % VARIANTS.length];
}
