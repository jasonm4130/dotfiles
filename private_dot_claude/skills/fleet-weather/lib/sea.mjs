// The procedural sea: a surface height field `y = height(x, t)` in scene pixels, built
// from a seed. Three travelling swell components (their wavenumbers, speeds and phases
// jittered by the seed) are shaped by a slow amplitude envelope and blended with a few
// octaves of smooth value noise drifting at different speeds and directions, so crests
// neither repeat on a visible period nor line up between sessions. Pure and
// deterministic: the same seed, tick and weather give the same sea.

const TAU = Math.PI * 2;

/** A 32-bit integer hash of two integers, as a number in [0, 1). */
export const hash = (a, b = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth 2-D value noise in [0, 1], C2-continuous across lattice cells. */
export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const ox = Math.imul(seed | 0, 7919), oy = Math.imul(seed | 0, 104729);
  const a = hash(xi + ox, yi + oy), b = hash(xi + 1 + ox, yi + oy);
  const c = hash(xi + ox, yi + 1 + oy), d = hash(xi + 1 + ox, yi + 1 + oy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Swell components: wavenumber (rad/px), speed (rad/tick, negative runs against the swell), weight. */
const SWELL = [
  { k: 0.36, w: 0.2, a: 1.0 },
  { k: 0.63, w: 0.31, a: 0.5 },
  { k: 1.13, w: -0.43, a: 0.2 },
];

/** Noise octaves: spatial frequency, drift (px-units/tick), evolution rate, weight. */
const OCTAVES = [
  { f: 0.11, d: 0.03, g: 0.012, a: 0.5 },
  { f: 0.23, d: 0.07, g: 0.02, a: 0.3 },
  { f: 0.47, d: -0.05, g: 0.035, a: 0.2 },
];

/**
 * @param {number} seed integer
 * @param {{ amp: number, speed: number, chop: number, steep: number, swell: number[] }} wx the weather's sea
 * @param {number} base mean surface row
 * @returns {{ height: (x: number, t: number) => number }}
 */
export function makeSea(seed, wx, base) {
  const s = seed | 0;
  const r = (i) => hash(s, 1000 + i);
  const comps = SWELL.map((c, i) => ({
    k: c.k * (1 + (r(i) - 0.5) * 0.2),
    w: c.w * wx.speed * (0.9 + 0.2 * r(10 + i)),
    ph: r(20 + i) * TAU,
    a: c.a * wx.swell[i],
  }));
  const total = comps.reduce((n, c) => n + c.a, 0);
  const sp = wx.speed;
  const envOff = r(30) * 100, nOff = r(31) * 100;
  return {
    height(x, t) {
      let sw = 0;
      for (const c of comps) sw += c.a * Math.sin(c.k * x - c.w * t + c.ph);
      sw /= total;
      // slow groups of taller and flatter swell: irregular crest heights
      const env = 0.55 + 0.6 * vnoise(x * 0.045 - t * 0.006 * sp + envOff, 5.0 + t * 0.003 * sp, s);
      let n = 0;
      for (let o = 0; o < OCTAVES.length; o++) {
        const q = OCTAVES[o];
        n += q.a * (vnoise(x * q.f - t * q.d * sp + nOff, o * 9.1 + t * q.g * sp, s + o) * 2 - 1);
      }
      const h = 1.7 * ((1 - wx.chop) * sw * env + wx.chop * n * 1.5);
      // peaked crests over flatter troughs, more so as the weather steepens
      const q = Math.max(-1.25, Math.min(1.25, h + wx.steep * (h * h - 0.2)));
      return base - wx.amp * q;
    },
  };
}
