#!/usr/bin/env node
// Prints the fleet-weather scene to stdout as ANSI truecolor, for eyeballing it without
// the TUI: every ship variant in every weather, a few frames apart.
//
//   node preview.mjs [--weather calm,storm] [--variant galleon,junk] [--frames 3]
//                    [--step 25] [--width 60] [--theme dark|light] [--seed 1]
import { SCENE_ROWS, VARIANTS, paletteFamily, sceneFrame } from "./lib/galleon.mjs";

const WEATHERS = ["calm", "clouds", "rain", "storm", "night"];

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1] ?? ""]] : [])),
);
const list = (value, all) => (value ? value.split(",").filter((v) => all.includes(v)) : all);
const weathers = list(args.weather, WEATHERS);
const variants = list(args.variant, VARIANTS);
const frames = Math.max(1, Number(args.frames) || 3);
const step = Math.max(1, Number(args.step) || 25);
const width = Math.max(1, Number(args.width) || 60);
const seed = Number(args.seed) || 1;
const family = paletteFamily(args.theme ?? "dark");

const rgb = (c) => `${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
const line = (row) => `${row.map((c) => `\x1b[38;2;${rgb(c.fg)};48;2;${rgb(c.bg)}m${c.ch}`).join("")}\x1b[0m`;

for (const variant of variants) {
  for (const weather of weathers) {
    console.log(`\n${variant} · ${weather} · ${family} · seed ${seed} · ${width} x ${SCENE_ROWS} cells, ticks ${Array.from({ length: frames }, (_, i) => i * step).join(", ")}`);
    const shots = Array.from({ length: frames }, (_, i) => sceneFrame(i * step, weather, family, width, { seed, variant }));
    for (let r = 0; r < SCENE_ROWS; r++) console.log(shots.map((f) => line(f[r])).join("  "));
  }
}
