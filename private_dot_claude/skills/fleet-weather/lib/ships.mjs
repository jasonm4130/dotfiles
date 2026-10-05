// The fleet's four vessels, drawn as [x, y, colour key] pixels in a local box 10 rows
// tall whose rows 8 and 9 ride under the waterline (WATERLINE is the first submerged
// row). Every ship faces right; the scene flips it to face its heading. Each has a rig
// that answers the weather: full sail in calm and cloud, reefed in rain, bare in a storm
// and furled at night, when its stern windows light.

/** Pixel colours by key. */
export const SHIP = {
  f: "#d77757", M: "#4a2e1c", S: "#f4ecd8", s: "#d2c39f", W: "#fffaf0", R: "#5a3420", H: "#7a4a2a",
  h: "#4f2f1a", G: "#d9a441", o: "#2a1a10", w: "#ffcf70", b: "#bfa77a", F: "#cdbf98", L: "#ffb347",
  N: "#2c3e5c", n: "#1c2a42", u: "#bdb8a8", U: "#ece8dc", E: "#c44a3a", J: "#c0472e", j: "#7d2b1c",
};

/** The keys that are sail cloth: what the rig tests count. */
export const SAIL_KEYS = "SsWJj";

/** The first local row under water. */
export const WATERLINE = 8;

export const VARIANTS = ["galleon", "schooner", "sloop", "junk"];

/** Rig levels: 0 full sail, 1 reefed (rain), 2 bare poles but a storm sail (storm), 3 furled (night). */
const levelFor = (weather) => (weather === "night" ? 3 : weather === "storm" ? 2 : weather === "rain" ? 1 : 0);

/**
 * A hull: columns x0..x1, each from its deck row down to its bottom row. The deck row is
 * the rail, the next the strake (gunports or windows break it), the lowest two the dark
 * waterline planks, anything between plain planking.
 */
function hull(put, o) {
  for (let x = o.x0; x <= o.x1; x++) {
    const deck = o.deck(x), bottom = o.bottom(x);
    for (let y = deck; y <= bottom; y++) {
      let k = y === deck ? o.rail : y >= bottom - 1 ? o.dark : o.body;
      if (y === deck + 1) k = o.ports?.(x) ? "o" : o.strake;
      if (y === deck + 1 && o.windows && x >= o.windows[0] && x <= o.windows[1]) k = "w";
      put(x, y, k);
    }
  }
}

const mast = (put, x, y0, y1) => { for (let y = y0; y <= y1; y++) put(x, y, "M"); };
const yard = (put, x0, x1, y) => { for (let x = x0; x <= x1; x++) put(x, y, "M"); };
const furl = (put, x0, x1, y) => { for (let x = x0; x <= x1; x++) put(x, y, "F"); };
/** A square sail: lit leading edge on the right, shaded left and foot. */
const square = (put, x0, x1, y0, y1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, x === x1 ? "W" : x === x0 || y === y1 ? "s" : "S");
};
/** A fore-and-aft sail from the row `y0` down to `y1`, left of its mast at `mx`, widening by one a row. */
const trapezoid = (put, mx, y0, y1, w0) => {
  for (let y = y0; y <= y1; y++) {
    const w = w0 + (y - y0);
    for (let x = mx - w; x < mx; x++) put(x, y, x === mx - w || y === y1 ? "s" : "S");
  }
};
/** A headsail: rows `y0`..`y1` from `x0`, each row to the matching entry of `ends`. */
const headsail = (put, x0, y0, ends) => {
  ends.forEach((x1, i) => { for (let x = x0; x <= x1; x++) put(x, y0 + i, x === x0 ? "s" : "S"); });
};

const galleon = {
  width: 26,
  pennants: [[11, 0, 3], [18, 1, 3], [5, 1, 1]],
  build(put, lvl) {
    hull(put, {
      x0: 1, x1: 22, rail: "R", strake: "G", body: "H", dark: "h",
      deck: (x) => (x <= 5 ? 5 : 6),
      bottom: (x) => (x <= 1 ? 7 : x === 2 ? 8 : x >= 22 ? 7 : x === 21 ? 8 : 9),
      ports: (x) => x >= 7 && x <= 19 && x % 3 === 0,
      windows: [2, 3],
    });
    for (let i = 0; i < 4; i++) put(22 + i, [5, 5, 4, 4][i], "b"); // bowsprit
    mast(put, 4, 1, 4); mast(put, 10, 0, 5); mast(put, 17, 1, 5);
    yard(put, 7, 13, 1); yard(put, 6, 14, 3); yard(put, 15, 19, 2); yard(put, 14, 20, 4);
    if (lvl === 0) { square(put, 8, 12, 2, 2); square(put, 16, 18, 3, 3); } else { furl(put, 8, 12, 2); furl(put, 16, 18, 3); }
    if (lvl <= 2) { square(put, 7, 13, 4, 5); square(put, 15, 19, 5, 5); } else { furl(put, 7, 13, 4); furl(put, 15, 19, 5); }
    if (lvl <= 2) { for (let y = 2; y <= 4; y++) for (let x = 4 - (y - 1); x < 4; x++) put(x, y, x === 4 - (y - 1) ? "s" : "S"); } else furl(put, 1, 3, 4); // mizzen gaff
    if (lvl <= 1) headsail(put, 20, 2, [20, 21, 22, 21]); // jib
  },
};

const schooner = {
  width: 26,
  pennants: [[9, 1, 3], [17, 0, 3]],
  build(put, lvl) {
    hull(put, {
      x0: 1, x1: 22, rail: "u", strake: "E", body: "N", dark: "n",
      deck: (x) => (x >= 21 ? 5 : 6),
      bottom: (x) => (x <= 1 ? 7 : x <= 3 ? 8 : x >= 22 ? 6 : x === 21 ? 7 : x === 20 ? 8 : 9),
      windows: [2, 3],
    });
    for (let i = 0; i < 3; i++) put(23 + i, [5, 5, 4][i], "b"); // bowsprit
    mast(put, 8, 1, 5); mast(put, 16, 0, 5);
    if (lvl <= 1) { trapezoid(put, 8, 2, 5, 3); trapezoid(put, 16, 1, 5, 3); }
    else if (lvl === 2) trapezoid(put, 16, 3, 5, 5); // storm trysail
    else { furl(put, 2, 7, 5); furl(put, 9, 15, 5); }
    if (lvl === 0) { put(6, 1, "S"); put(7, 1, "S"); put(14, 0, "S"); put(15, 0, "S"); } // topsails
    if (lvl === 0) headsail(put, 17, 2, [18, 20, 22, 22]);
    else if (lvl === 1) headsail(put, 17, 4, [22, 22]);
  },
};

const sloop = {
  width: 20,
  pennants: [[9, 0, 3]],
  build(put, lvl) {
    hull(put, {
      x0: 1, x1: 16, rail: "u", strake: "E", body: "U", dark: "u",
      deck: () => 6,
      bottom: (x) => (x <= 1 ? 7 : x === 2 ? 8 : x >= 16 ? 7 : x === 15 ? 8 : 9),
      windows: [2, 3],
    });
    for (let i = 0; i < 3; i++) put(17 + i, [5, 5, 4][i], "b"); // bowsprit
    mast(put, 8, 0, 5);
    if (lvl === 0) { trapezoid(put, 8, 1, 5, 1); headsail(put, 9, 1, [9, 10, 12, 14, 16]); }
    else if (lvl === 1) { trapezoid(put, 8, 3, 5, 3); headsail(put, 9, 4, [14, 16]); }
    else if (lvl === 2) trapezoid(put, 8, 4, 5, 4);
    else furl(put, 3, 7, 5);
  },
};

const junk = {
  width: 24,
  pennants: [[13, 0, 3], [19, 2, 2]],
  build(put, lvl) {
    hull(put, {
      x0: 1, x1: 21, rail: "R", strake: "G", body: "H", dark: "h",
      deck: (x) => (x <= 4 ? 4 : x >= 20 ? 5 : 6),
      bottom: (x) => (x <= 1 ? 7 : x === 2 ? 8 : x >= 20 ? 8 : 9),
      windows: [2, 3],
    });
    // battened sails: cloth rows alternate with dark battens
    const batten = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, (y1 - y) % 2 === 0 ? "J" : "j"); };
    if (lvl <= 1) batten(6, 13, lvl === 0 ? 1 : 3, 5);
    else if (lvl === 2) batten(6, 13, 4, 5);
    else furl(put, 6, 13, 5);
    if (lvl <= 2) batten(15, 19, 3, 5); else furl(put, 15, 19, 5);
    mast(put, 12, 0, 5); mast(put, 18, 2, 5);
  },
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
  const put = (x, y, k) => cells.set(y * 64 + x, [x, y, k]);
  ship.build(put, levelFor(weather));
  const w = Math.round(Math.sin(t * 0.8) * 0.6 + 0.5); // pennants, waving
  for (const [x, y, len] of ship.pennants) {
    for (let i = 0; i < len; i++) put(x + i, i === len - 1 && len > 1 ? y + w : y, "f");
  }
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
