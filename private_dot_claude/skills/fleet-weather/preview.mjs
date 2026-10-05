#!/usr/bin/env node
// Prints the fleet-weather scene to stdout as ANSI truecolor, for eyeballing it without
// the TUI: every ship variant in every weather, the same frame fitted to each glyph set
// side by side (half, quadrant, sextant, octant), a few frames apart. Octant and sextant
// need a terminal and font that draw Unicode 16 and 13 legacy-computing blocks (Ghostty
// does); the band itself draws quadrant or half, the sets Claude Code's Raster accepts.
//
//   node preview.mjs [--weather calm,storm] [--variant galleon,junk] [--glyphs half,octant]
//                    [--frames 1] [--step 25] [--width 48] [--theme dark|light] [--seed 1]
import { GLYPH_SETS, SCENE_ROWS, VARIANTS, paletteFamily, sceneFrame } from "./lib/galleon.mjs";

const WEATHERS = ["calm", "clouds", "rain", "storm", "night"];
const PANELS = [...GLYPH_SETS].reverse(); // coarsest first: half, quadrant, sextant, octant

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1] ?? ""]] : [])),
);
const list = (value, all) => (value ? value.split(",").filter((v) => all.includes(v)) : all);
const weathers = list(args.weather, WEATHERS);
const variants = list(args.variant, VARIANTS);
const glyphs = list(args.glyphs, PANELS);
const frames = Math.max(1, Number(args.frames) || 1);
const step = Math.max(1, Number(args.step) || 25);
const width = Math.max(1, Number(args.width) || 48);
const seed = Number(args.seed) || 1;
const family = paletteFamily(args.theme ?? "dark");

const rgb = (c) => `${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
const line = (row) => `${row.map((c) => `\x1b[38;2;${rgb(c.fg)};48;2;${rgb(c.bg)}m${c.ch}`).join("")}\x1b[0m`;
const pad = (s) => s.padEnd(width + 2);

for (const variant of variants) {
  for (const weather of weathers) {
    console.log(`\n${variant} · ${weather} · ${family} · seed ${seed} · ${width} x ${SCENE_ROWS} cells`);
    for (let f = 0; f < frames; f++) {
      const t = f * step;
      console.log(glyphs.map((g) => pad(`${g} @${t}`)).join(""));
      const shots = glyphs.map((g) => sceneFrame(t, weather, family, width, { seed, variant, glyphs: g }));
      for (let r = 0; r < SCENE_ROWS; r++) console.log(shots.map((frame) => line(frame[r])).join("  "));
    }
  }
}
