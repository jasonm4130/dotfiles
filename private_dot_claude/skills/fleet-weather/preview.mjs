#!/usr/bin/env node
// Prints the fleet-weather scene to stdout as ANSI truecolor, for eyeballing it without
// the TUI: every ship variant in every weather, the same frame fitted to each glyph set
// side by side, a few frames apart, each panel headed by its reconstruction error (the
// mean squared RGB distance between the cells as drawn and the scene's pixels). By
// default it compares the band's two richer sets, quadrant and extended; --glyphs adds
// half, sextant or octant, which need a terminal and font that draw Unicode 13 and 16
// legacy-computing blocks (Ghostty does) and which the band itself cannot draw.
// Successive frames are fitted against the one before, as the band fits them.
//
//   node preview.mjs [--weather calm,storm] [--variant galleon,junk] [--glyphs quadrant,extended]
//                    [--frames 1] [--step 25] [--width 48] [--theme dark|light] [--seed 1]
//   node preview.mjs --bench [--glyphs quadrant,extended]   time a frame at 80, 200 and 512 columns
import { CELL_H, CELL_W, GLYPH_SETS, inkOf } from "./lib/cells.mjs";
import { SCENE_ROWS, VARIANTS, paletteFamily, sceneFrame, scenePixels } from "./lib/galleon.mjs";
import { packCells } from "./lib/pack.mjs";

const WEATHERS = ["calm", "clouds", "rain", "storm", "night"];

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") ? "" : all[i + 1] ?? ""]] : [])),
);
const list = (value, all, fallback = all) => (value ? value.split(",").filter((v) => all.includes(v)) : fallback);
const weathers = list(args.weather, WEATHERS);
const variants = list(args.variant, VARIANTS);
const glyphs = list(args.glyphs, GLYPH_SETS, ["quadrant", "extended"]);
const frames = Math.max(1, Number(args.frames) || 1);
const step = Math.max(1, Number(args.step) || 25);
const width = Math.max(1, Number(args.width) || 48);
const seed = Number(args.seed) || 1;
const family = paletteFamily(args.theme ?? "dark");

/** Mean squared RGB error of a frame against the pixels it was fitted to, each glyph by its coverage. */
function error(frame, px) {
  const columns = frame[0].length;
  let sum = 0;
  frame.forEach((row, r) => row.forEach((cell, c) => {
    const ink = inkOf(cell.ch);
    for (let i = 0; i < CELL_W * CELL_H; i++) {
      const sx = i & 1, sy = i >> 1;
      const a = ink.alpha[Math.min(ink.gh - 1, Math.floor((sy * ink.gh) / CELL_H)) * ink.gw + sx];
      const p = px[(r * CELL_H + sy) * columns * CELL_W + c * CELL_W + sx];
      for (const s of [16, 8, 0]) sum += (a * ((cell.fg >> s) & 255) + (1 - a) * ((cell.bg >> s) & 255) - ((p >> s) & 255)) ** 2;
    }
  }));
  return sum / (columns * CELL_W * frame.length * CELL_H);
}

if ("bench" in args) {
  for (const g of glyphs) {
    for (const columns of [80, 200, 512]) {
      const runs = [];
      let prev;
      for (let t = 0; t < 120; t++) {
        const start = performance.now();
        prev = sceneFrame(t, "storm", family, columns, { seed, glyphs: g, prev });
        packCells(prev, columns);
        if (t >= 20) runs.push(performance.now() - start);
      }
      runs.sort((a, b) => a - b);
      const mean = runs.reduce((n, v) => n + v, 0) / runs.length;
      console.log(`${g.padEnd(9)} ${String(columns).padStart(3)} columns  mean ${mean.toFixed(2)} ms  p95 ${runs[Math.floor(runs.length * 0.95)].toFixed(2)} ms`);
    }
  }
  process.exit(0);
}

const rgb = (c) => `${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
const line = (row) => `${row.map((c) => `\x1b[38;2;${rgb(c.fg)};48;2;${rgb(c.bg)}m${c.ch}`).join("")}\x1b[0m`;
const pad = (s) => s.padEnd(width + 2);

for (const variant of variants) {
  for (const weather of weathers) {
    console.log(`\n${variant} · ${weather} · ${family} · seed ${seed} · ${width} x ${SCENE_ROWS} cells`);
    const prev = {};
    for (let f = 0; f < frames; f++) {
      const t = f * step;
      const { px } = scenePixels(t, weather, family, width, { seed, variant });
      const shots = glyphs.map((g) => (prev[g] = sceneFrame(t, weather, family, width, { seed, variant, glyphs: g, prev: prev[g] })));
      console.log(glyphs.map((g, i) => pad(`${g} @${t} err ${error(shots[i], px).toFixed(0)}`)).join(""));
      for (let r = 0; r < SCENE_ROWS; r++) console.log(shots.map((frame) => line(frame[r])).join("  "));
    }
  }
}
