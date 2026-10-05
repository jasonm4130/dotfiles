// The fleet scene: a ship sailing a half-block pixel sea under the fleet's weather,
// painted as Raster cells.
//
// Pure and deterministic per tick and seed, so tests seek animation time exactly. Every
// cell is `▀` with the upper pixel as foreground and the lower as background (or a space
// when both match), giving square 2-pixels-per-cell art 12 pixels (6 rows) tall. Colours
// are RGB from small palettes and quantised blends, so a frame stays far under the
// Raster palette's 1024 distinct colour pairs whatever the width. The ship (one of four
// variants in ./ships.mjs) bounces along the row, flipping to face its heading; it
// heaves and pitches with the sea under its bow and stern. The sea is procedural
// (./sea.mjs): swell and drifting noise, with foam, spray and glints derived from the
// height and slope of that surface. The board in Firstmate's data/ship-mod-design is the
// original galleon scene's mockup.
import { hash, makeSea, vnoise } from "./sea.mjs";
import { SHIP, SHIPS, WATERLINE, shipPixels } from "./ships.mjs";

export { VARIANTS, resolveVariant } from "./ships.mjs";

/** `0x01000000` (bit 24 alone) asks the Raster for the terminal's default colour. */
export const DEFAULT_COLOR = 0x01000000;

/** Terminal rows the scene takes: 12 pixels as half-blocks. */
export const SCENE_ROWS = 6;
const H = SCENE_ROWS * 2;

/** The mean surface row: the ship's waterline sits here in a flat calm, leaving 3 pixels of sea beneath. */
const BASE = 9;

/** One scheduler tick; water, weather and pennants advance every tick. */
export const TICK_MS = 150;

/** The ship moves one pixel column every Nth tick (450 ms). */
const TICKS_PER_MOVE = 3;

/** The widest ship's local box in pixels (the galleon and schooner; the others are narrower). */
export const SHIP_WIDTH = 26;

const hex = (s) => parseInt(s.slice(1), 16);
const mix = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const quant = (v, n) => Math.round(v * n) / n;

/**
 * Per weather: the sea (`amp` pixels of swell, `speed`, share of drifting noise `chop`,
 * crest `steep`ness, `swell` component weights), its whitecaps (`cap` the crest height
 * they start at, `foam` their strength, `spray` the storm's flung water) and the sky.
 */
export const WEATHER = {
  calm: { amp: 0.8, speed: 1.0, chop: 0.22, steep: 0.1, swell: [1, 0.4, 0.12], cap: 0.6, foam: 0.4, spray: 0, cloud: 0, rain: 0, bolt: false, night: false },
  clouds: { amp: 0.95, speed: 1.0, chop: 0.28, steep: 0.15, swell: [1, 0.5, 0.2], cap: 0.5, foam: 0.5, spray: 0, cloud: 0.8, rain: 0, bolt: false, night: false },
  rain: { amp: 1.3, speed: 1.4, chop: 0.42, steep: 0.25, swell: [1, 0.7, 0.4], cap: 0.35, foam: 0.65, spray: 0.15, cloud: 1, rain: 0.35, bolt: false, night: false },
  storm: { amp: 1.9, speed: 1.9, chop: 0.55, steep: 0.45, swell: [1, 0.8, 0.55], cap: 0.15, foam: 1.0, spray: 0.55, cloud: 1, rain: 0.6, bolt: true, night: false },
  night: { amp: 0.55, speed: 0.6, chop: 0.2, steep: 0.08, swell: [1, 0.35, 0.1], cap: 0.65, foam: 0.3, spray: 0, cloud: 0, rain: 0, bolt: false, night: true },
};

/**
 * Sky, sea and weather colours per theme family and weather.
 * @type {Record<string, Record<string, Record<string, any>>>}
 */
const PALETTES = {
  dark: {
    calm: { top: "#1f3f7a", bot: "#79acdc", sea: ["#4b92cf", "#2d68a6", "#173d70"], foam: "#e3f2fd", sun: "#ffd27a", halo: "#b9d3ec" },
    clouds: { top: "#3a4656", bot: "#8a98ab", sea: ["#55799a", "#3a5a77", "#213b54"], foam: "#d3dde6", cl: "#c9d0d9", cd: "#8e98a6" },
    rain: { top: "#262d38", bot: "#5c6878", sea: ["#41607b", "#2b445b", "#18293a"], foam: "#b7c7d4", cl: "#7f8a99", cd: "#596473", rain: "#a8bdd6" },
    storm: { top: "#121220", bot: "#33314a", sea: ["#2d3a58", "#1c253b", "#0e1424"], foam: "#b3bdd6", cl: "#4a4862", cd: "#29283a", rain: "#8a98bd", flash: "#c9c6ff", bolt: "#fffbe0" },
    night: { top: "#050a1a", bot: "#1c2c52", sea: ["#203462", "#142347", "#0a1430"], foam: "#5a6c96", moon: "#f2eed6", star: "#ffffff", glint: "#d8d3b0" },
  },
  light: {
    calm: { top: "#5fa8e8", bot: "#d3ebfb", sea: ["#4aa3e3", "#2f80c5", "#1d5d9c"], foam: "#ffffff", sun: "#ffbf2e", halo: "#fff1c4" },
    clouds: { top: "#9fb0c2", bot: "#e3e9f0", sea: ["#7298b8", "#577c9c", "#3d5f7d"], foam: "#f4f8fb", cl: "#ffffff", cd: "#c7d0db" },
    rain: { top: "#7b8999", bot: "#bcc6d1", sea: ["#5d7f9b", "#466681", "#314d66"], foam: "#e7eef4", cl: "#dbe2ea", cd: "#a2aebc", rain: "#4f6884" },
    storm: { top: "#393b50", bot: "#707290", sea: ["#43506f", "#2f3a55", "#1e263b"], foam: "#d6dcea", cl: "#8b8ca6", cd: "#55566e", rain: "#c6cde3", flash: "#f3f1ff", bolt: "#fff3a0" },
    night: { top: "#0f1d40", bot: "#3a5694", sea: ["#2a4778", "#1c3460", "#112447"], foam: "#7c90bd", moon: "#fff6d8", star: "#ffffff", glint: "#e8dfb4" },
  },
};

/** Lightning flashes on three ticks of every 34; the bolt shows on two of them. */
const flashAt = (t) => { const p = t % 34; return p === 0 || p === 1 || p === 4; };
const boltAt = (t) => { const p = t % 34; return p === 0 || p === 4; };

/** Bounce track: the column and heading after `t` ticks on a track of `span` columns. */
export function track(t, span) {
  if (span <= 0) return { pos: 0, dir: 1 };
  const k = Math.floor(t / TICKS_PER_MOVE) % (span * 2);
  return k < span ? { pos: k, dir: 1 } : { pos: span * 2 - k, dir: -1 };
}

/**
 * A ship facing right in its local box, as [x, y, colour key] pixels.
 * @param {string} weather
 * @param {number} t
 * @param {string} [variant] one of VARIANTS
 */
export function galleonPixels(weather, t, variant = "galleon") {
  return shipPixels(weather, t, variant);
}

/**
 * One frame of the scene, exactly `width` cells by SCENE_ROWS, as rows of
 * `{ ch, fg, bg }` with RGB numbers (DEFAULT_COLOR never appears: the scene is opaque).
 * @param {number} t tick
 * @param {"storm" | "rain" | "clouds" | "night" | "calm"} weather
 * @param {"dark" | "light"} family
 * @param {number} width terminal columns
 * @param {{ seed?: number, variant?: string }} [opts] the sea's seed and the ship (default the galleon)
 */
export function sceneFrame(t, weather, family, width, opts = {}) {
  const W = Math.max(1, Math.floor(width));
  const wx = WEATHER[weather] ?? WEATHER.calm;
  const p = (PALETTES[family] ?? PALETTES.light)[weather] ?? PALETTES.light.calm;
  const ship = SHIPS[opts.variant] ?? SHIPS.galleon;
  const sea = makeSea(opts.seed ?? 0, wx, BASE);
  const P = Array.from({ length: H }, () => new Array(W).fill(0));
  const flash = wx.bolt && flashAt(t);
  const top = hex(p.top), bot = hex(p.bot);

  for (let y = 0; y < H; y++) {
    let c = mix(top, bot, y / (H - 1));
    if (flash) c = mix(c, hex(p.flash), 0.65);
    P[y].fill(c);
  }
  const sx = Math.floor(W * 0.82);
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  if (weather === "calm") {
    for (let y = 0; y < 6; y++) for (let x = sx - 3; x <= sx + 3; x++) {
      if (!inside(x, y)) continue;
      const d = Math.hypot(x - sx, y - 2.5);
      if (d < 1.6) P[y][x] = hex(p.sun);
      else if (d < 2.6) P[y][x] = mix(P[y][x], hex(p.halo), 0.5);
    }
  }
  if (wx.night) {
    for (let i = 0; i < Math.floor(W / 3.5); i++) {
      const x = Math.floor(hash(i, 3) * W), y = Math.floor(hash(i, 9) * 7);
      if (hash(i, Math.floor(t / 5)) > 0.3) P[y][x] = mix(P[y][x], hex(p.star), 0.35 + 0.65 * hash(i, 77));
    }
    for (let y = 0; y < 6; y++) for (let x = sx - 3; x <= sx + 3; x++) {
      if (inside(x, y) && Math.hypot(x - sx, y - 2.5) < 1.9 && Math.hypot(x - sx - 1.1, y - 2.0) > 1.5) P[y][x] = hex(p.moon);
    }
  }
  if (wx.cloud > 0) {
    const n = Math.round(2 + wx.cloud * 4), span = W + 24;
    for (let k = 0; k < n; k++) {
      const cx = ((k * 23 + hash(k, 5) * span + t * 0.12 * wx.speed) % span) - 12;
      const cy = 1.2 + (k % 3) * 0.9, rx = 4 + hash(k, 1) * 5, ry = 1.4 + hash(k, 2) * 0.9;
      for (let y = 0; y < 8; y++) for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(W, cx + rx + 1); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) P[y][x] = flash ? mix(hex(p.cl), hex(p.flash), 0.6) : y < cy ? hex(p.cl) : hex(p.cd);
      }
    }
  }

  // the surface, sampled one column beyond each edge so every column has a slope
  const S = new Float64Array(W + 2);
  for (let i = 0; i < W + 2; i++) S[i] = sea.height(i - 1, t);
  const surf = (x) => S[x + 1];
  const slope = (x) => (S[x + 2] - S[x]) / 2; // > 0 where the surface falls away to the right

  // the ship rides the sea under its stern and bow: heave with their mean, pitch with their difference
  const tr = track(t, W - ship.width);
  const xOf = (lx) => (tr.dir > 0 ? tr.pos + lx : tr.pos + ship.width - 1 - lx);
  const lxS = Math.round(ship.width * 0.12), lxB = Math.round(ship.width * 0.82);
  const hS = sea.height(xOf(lxS), t), hB = sea.height(xOf(lxB), t);
  const heave = BASE + 0.6 * ((hS + hB) / 2 - BASE) - WATERLINE;
  const pitch = (hB - hS) * 0.5;
  const tint = (c) => {
    if (weather === "storm" || weather === "rain") c = mix(c, bot, 0.22);
    if (wx.night) c = mix(c, top, 0.45);
    if (flash) c = mix(c, 0xffffff, 0.3);
    return c;
  };
  for (const [lx, ly, key] of shipPixels(weather, t, opts.variant)) {
    const x = xOf(lx), y = Math.max(-1, Math.round(heave + (pitch * (lx - (lxS + lxB) / 2)) / (lxB - lxS))) + ly;
    if (!inside(x, y)) continue;
    P[y][x] = key === "w" && wx.night ? (t % 9 < 7 ? hex(SHIP.L) : mix(hex(SHIP.L), 0, 0.3)) : tint(hex(SHIP[key]));
  }

  // the sea, drawn over the ship's waterline: lightness falls with depth and in the
  // troughs, rises into foam on tall, front-facing crests; the top pixel of each column
  // is blended with what is behind it by how much of it the surface covers
  const ramp = [hex(p.sea[2]), hex(p.sea[2]), hex(p.sea[1]), hex(p.sea[0]), hex(p.foam)];
  ramp[0] = mix(ramp[1], 0, 0.3);
  const stops = [-0.35, 0, 0.5, 1, 1.5];
  const shade = (L) => {
    if (L <= stops[0]) return ramp[0];
    for (let i = 1; i < stops.length; i++) if (L <= stops[i]) return mix(ramp[i - 1], ramp[i], (L - stops[i - 1]) / (stops[i] - stops[i - 1]));
    return ramp[4];
  };
  const glintColour = hex(weather === "calm" ? p.sun : p.glint ?? p.foam);
  const glints = weather === "calm" || wx.night;
  const aim = (x) => (sx - x) * 0.045; // the slope that turns a facet toward the sun or moon
  for (let x = 0; x < W; x++) {
    const s = surf(x), sl = slope(x);
    const u = (BASE - s) / wx.amp; // height in swell units: +1 a crest, -1 a trough
    const foam = quant(smooth(wx.cap, wx.cap + 0.35, u) * (0.75 + 0.25 * clamp01(sl / 0.6 + 0.5)) * wx.foam, 4);
    const trough = smooth(-0.25, -1, u) * 0.3;
    const lit = glints ? Math.exp(-(((x - sx) / 3) ** 2)) * clamp01(1 - Math.abs(sl - aim(x)) / 0.3) ** 2 : 0;
    for (let y = Math.max(0, Math.floor(s)); y < H; y++) {
      const cov = quant(clamp01(y + 1 - s), 4);
      if (cov === 0) continue;
      const d = Math.max(0, y + 0.5 - s);
      const rim = 0.3 * smooth(-0.2, 1, u) * Math.max(0, 1 - d / 1.2);
      let c = shade(quant(1 - d / 2.2 - trough + rim + 0.8 * foam * Math.max(0, 1 - d / 1.6), 8));
      if (lit > 0 && d < 2) c = mix(c, glintColour, quant(0.7 * lit * (1 - d / 2), 4));
      if (flash) c = mix(c, hex(p.flash), 0.35);
      P[y][x] = cov < 1 ? mix(P[y][x], c, cov) : c;
    }
    // storm and rain fling spray off the whitecaps: streaks of foam in the air above a crest
    if (wx.spray > 0 && foam > 0.25) {
      for (let k = 1; k <= 2; k++) {
        const y = Math.floor(s) - k;
        if (y < 0 || y >= H) continue;
        const a = quant(clamp01((vnoise(x * 0.6 - t * 0.3, y * 1.7 + t * 0.12, opts.seed ?? 0) - 0.5) * 2) * wx.spray * foam * (k === 1 ? 1 : 0.5), 4);
        if (a > 0) P[y][x] = mix(P[y][x], hex(p.foam), a);
      }
    }
  }
  if (wx.rain > 0) {
    for (let i = 0; i < Math.floor(W * wx.rain); i++) {
      const y = Math.floor((hash(i, 11) * (H + 4) + t * 1.7) % (H + 4)) - 2;
      const x = Math.floor((hash(i, 12) * W + t * 0.9 + y * 0.6) % W);
      for (let k = 0; k < 2; k++) {
        const yy = y - k, xx = x - k;
        if (inside(xx, yy) && yy < surf(xx)) P[yy][xx] = mix(P[yy][xx], hex(p.rain), 0.7);
      }
    }
  }
  if (wx.bolt && boltAt(t)) {
    let bx = Math.floor(W * (0.15 + 0.7 * hash(Math.floor(t / 34), 4)));
    for (let y = 0; y < H && y < surf(bx); y++) {
      P[y][bx] = hex(p.bolt);
      bx = Math.max(0, Math.min(W - 1, bx + (hash(y, Math.floor(t / 34)) > 0.5 ? 1 : -1)));
    }
  }

  const rows = [];
  for (let r = 0; r < SCENE_ROWS; r++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const a = P[2 * r][x], b = P[2 * r + 1][x];
      row.push(a === b ? { ch: " ", fg: a, bg: a } : { ch: "▀", fg: a, bg: b });
    }
    rows.push(row);
  }
  return rows;
}

/** The theme family for a `theme` setting: `dark*` is dark, everything else light, as Calm does. */
export function paletteFamily(theme) {
  return typeof theme === "string" && theme.startsWith("dark") ? "dark" : "light";
}
