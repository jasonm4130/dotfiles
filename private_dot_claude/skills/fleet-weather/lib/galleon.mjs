// The galleon scene: a three-masted ship sailing a half-block pixel sea under the
// fleet's weather, painted as Raster cells.
//
// Pure and deterministic per tick, so tests seek animation time exactly. Every cell is
// `▀` with the upper pixel as foreground and the lower as background (or a space when
// both match), giving square 2-pixels-per-cell art 14 pixels (7 rows) tall. Colours are
// RGB from small quantised palettes, so a frame stays far under the Raster palette's
// 1024 distinct colour pairs whatever the width. The ship bounces along the row,
// flipping to face its heading; it rides the actual wave surface, reefs its topsails in
// rain, strikes the jib in a storm, and furls everything at night with its stern
// windows lit. The board in Firstmate's data/ship-mod-design is this scene's mockup.

/** `0x01000000` (bit 24 alone) asks the Raster for the terminal's default colour. */
export const DEFAULT_COLOR = 0x01000000;

/** Terminal rows the scene takes: 14 pixels as half-blocks. */
export const SCENE_ROWS = 7;
const H = SCENE_ROWS * 2;

/** One scheduler tick; water, weather and pennants advance every tick. */
export const TICK_MS = 150;

/** The ship moves one pixel column every Nth tick (450 ms). */
const TICKS_PER_MOVE = 3;

/** The ship's local box: 36 pixels wide, waterline at local row 11. */
export const SHIP_WIDTH = 36;

const hex = (s) => parseInt(s.slice(1), 16);
const mix = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
const hash = (a, b = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const WEATHER = {
  calm: { amp: 0.7, chop: 0.15, speed: 1.0, cloud: 0, rain: 0, bolt: false, night: false },
  clouds: { amp: 0.9, chop: 0.3, speed: 1.0, cloud: 0.8, rain: 0, bolt: false, night: false },
  rain: { amp: 1.4, chop: 0.7, speed: 1.5, cloud: 1, rain: 0.35, bolt: false, night: false },
  storm: { amp: 2.1, chop: 1.0, speed: 2.0, cloud: 1, rain: 0.6, bolt: true, night: false },
  night: { amp: 0.5, chop: 0.1, speed: 0.6, cloud: 0, rain: 0, bolt: false, night: true },
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

const SHIP = {
  f: "#d77757", M: "#4a2e1c", S: "#f4ecd8", s: "#d2c39f", W: "#fffaf0", R: "#5a3420", H: "#7a4a2a",
  h: "#4f2f1a", G: "#d9a441", o: "#2a1a10", w: "#ffcf70", b: "#bfa77a", F: "#cdbf98", L: "#ffb347",
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
 * The galleon facing right in its 36 x 13 local box, as [x, y, colour key] pixels.
 * @param {string} weather
 * @param {number} t
 */
export function galleonPixels(weather, t) {
  const px = [];
  const put = (x, y, k) => px.push([x, y, k]);
  const reef = weather === "rain" || weather === "storm";
  const furl = weather === "night";
  const square = (mx, yard, c0, c1, hw, furled) => {
    for (let x = mx - hw - 1; x <= mx + hw + 1; x++) put(x, yard, "M");
    if (furled) {
      for (let x = mx - hw; x <= mx + hw; x++) put(x, yard + 1, "F");
      return;
    }
    for (let y = c0; y <= c1; y++) {
      for (let x = mx - hw; x <= mx + hw; x++) put(x, y, x >= mx + hw ? "W" : x <= mx - hw || y === c1 ? "s" : "S");
    }
  };
  for (let lx = 2; lx <= 31; lx++) {
    // hull: raised stern castle and forecastle, a gold strake with gunports, raked ends
    const deck = lx <= 7 ? 6 : lx >= 27 ? 7 : 8;
    const bottom = lx <= 2 ? 10 : lx <= 4 ? 11 : lx >= 31 ? 9 : lx === 30 ? 10 : lx === 29 ? 11 : 12;
    for (let y = deck; y <= bottom; y++) {
      let k = y === deck ? "R" : y >= bottom - 1 ? "h" : "H";
      if (y === deck + 1 && lx > 3) k = lx >= 8 && lx <= 26 && lx % 3 === 0 ? "o" : "G";
      if (y === deck + 1 && lx >= 3 && lx <= 5) k = "w";
      put(lx, y, k);
    }
  }
  for (let i = 0; i <= 4; i++) put(31 + i, 7 - Math.round(i * 0.75), "b"); // bowsprit
  for (let y = 2; y <= 7; y++) put(8, y, "M");
  for (let y = 0; y <= 7; y++) put(17, y, "M");
  for (let y = 1; y <= 7; y++) put(25, y, "M");
  square(17, 1, 2, 3, 3, reef || furl);
  square(17, 4, 5, 7, 5, furl);
  square(25, 2, 3, 4, 3, reef || furl);
  square(25, 5, 6, 7, 4, furl);
  if (!furl) {
    for (let y = 3; y <= 7; y++) for (let x = 8 - (y - 2); x < 8; x++) put(x, y, x === 8 - (y - 2) ? "s" : "S"); // mizzen gaff
  } else {
    put(5, 3, "F"); put(6, 3, "F"); put(7, 3, "F");
  }
  if (!furl && weather !== "storm") {
    for (let y = 3; y <= 7; y++) {
      const x1 = Math.round(26 + (y - 2) * 1.6);
      for (let x = 26; x <= Math.min(x1, 34 - (y - 3)); x++) put(x, y, x === 26 ? "s" : "S"); // jib
    }
  }
  const w = Math.round(Math.sin(t * 0.8) * 0.6 + 0.5); // pennants, waving
  put(18, 0, "f"); put(19, 0, "f"); put(20, w, "f");
  put(26, 1, "f"); put(27, 1 + w, "f");
  put(9, 2, "f");
  return px;
}

/**
 * One frame of the scene, exactly `width` cells by SCENE_ROWS, as rows of
 * `{ ch, fg, bg }` with RGB numbers (DEFAULT_COLOR never appears: the scene is opaque).
 * @param {number} t tick
 * @param {"storm" | "rain" | "clouds" | "night" | "calm"} weather
 * @param {"dark" | "light"} family
 * @param {number} width terminal columns
 */
export function sceneFrame(t, weather, family, width) {
  const W = Math.max(1, Math.floor(width));
  const wx = WEATHER[weather] ?? WEATHER.calm;
  const p = (PALETTES[family] ?? PALETTES.light)[weather] ?? PALETTES.light.calm;
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

  const ph = t * 0.42 * wx.speed;
  const surf = (x) => 11.0 + wx.amp * Math.sin(x * 0.33 - ph) * 0.9 + wx.chop * Math.sin(x * 1.17 + ph * 1.9) * 0.7;

  // the ship rides the wave under its centre: local waterline row 11 on the surface
  const tr = track(t, W - SHIP_WIDTH);
  const shipTop = Math.round(surf(tr.pos + SHIP_WIDTH / 2) - 11);
  const tint = (c) => {
    if (weather === "storm" || weather === "rain") c = mix(c, bot, 0.22);
    if (wx.night) c = mix(c, top, 0.45);
    if (flash) c = mix(c, 0xffffff, 0.3);
    return c;
  };
  for (const [lx, ly, key] of galleonPixels(weather, t)) {
    const x = tr.dir > 0 ? tr.pos + lx : tr.pos + SHIP_WIDTH - 1 - lx, y = shipTop + ly;
    if (!inside(x, y)) continue;
    P[y][x] = key === "w" && wx.night ? (t % 9 < 7 ? hex(SHIP.L) : mix(hex(SHIP.L), 0, 0.3)) : tint(hex(SHIP[key]));
  }

  // the sea, drawn over the ship's waterline
  for (let x = 0; x < W; x++) {
    const s = surf(x);
    const crest = Math.cos(x * 0.33 - ph) > 0.7 && wx.chop + wx.amp > 0.9;
    for (let y = Math.max(0, Math.ceil(s)); y < H; y++) {
      const d = y - s;
      let c = d < 1.2 ? hex(p.sea[0]) : d < 2.4 ? hex(p.sea[1]) : hex(p.sea[2]);
      if (d < 1 && (crest || hash(x, Math.floor(t / 3)) > 0.93)) c = hex(p.foam);
      if (weather === "calm" && d < 2 && Math.abs(x - sx) < 3 && hash(x, t) > 0.6) c = mix(c, hex(p.sun), 0.6);
      if (wx.night && d < 2.5 && Math.abs(x - sx) < 2 && hash(x * 7, Math.floor(t / 2) + y) > 0.45) c = hex(p.glint);
      if (flash) c = mix(c, hex(p.flash), 0.35);
      P[y][x] = c;
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
