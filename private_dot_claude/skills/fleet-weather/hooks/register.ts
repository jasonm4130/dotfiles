// fleet-weather: a ship sailing the band above the prompt, in the weather of the
// captain's Firstmate fleet. Each session sails one of four vessels (galleon, schooner,
// sloop, junk), picked from a seed taken when the mod loads and kept for the session's
// life; FLEET_WEATHER_SHIP pins one by name (anything else means pick for me).
//
// This file is the only one that touches the engine interface `$`; the forecast
// (../lib/weather.mjs), the scene (../lib/galleon.mjs) and the Raster packing
// (../lib/pack.mjs) are pure and tested under `node --test` from the dotfiles repo.
//
// Scope: the captain's own sessions. A Firstmate worker (FM_TASK_ID set) loads this
// plugin too, because ~/.claude-fm-workers/skills links to ~/.claude/skills, and gets a
// complete no-op: no timer, no read, every drawing passed on. A session whose home has
// no readable state/home-summary.json draws nothing either, but keeps checking, so the
// band appears once Firstmate publishes one.
//
// Drawing: the `AbovePrompt` band, not the working row, so Firstmate Calm's `Spinner`
// hook and this one never contest a site. One Raster is repainted in place through
// `$.ui.blit` on the scene's tick (slower while no turn runs); the caption under it
// names the weather's reason and redraws only when the forecast changes.
//
// Reading the fleet: every 5 s, stat three small files and re-read one only when its
// size or mtime moved (a file changed within the last 5 s is read again next time,
// as Firstmate Calm does). No process is started.
import type { EngineInterface, Register } from "claude-code";
import { forecast, parseSummary, trackBlocked } from "../lib/weather.mjs";
import { paletteFamily, resolveVariant, sceneFrame, SCENE_ROWS, TICK_MS } from "../lib/galleon.mjs";
import { packCells } from "../lib/pack.mjs";

type Forecast = { weather: "storm" | "rain" | "clouds" | "night" | "calm"; reason: string };

const RASTER_KEY = "fleet-weather-galleon";
const MAX_COLUMNS = 512;
const POLL_MS = 5000;
const SETTLED_MS = 5000;
/** While no turn runs the band repaints every Nth tick: the same sea, a quieter cost. */
const IDLE_TICKS_PER_FRAME = 4;
/** The plugin store key holding when each open `blocked` decision was first seen. */
const FIRST_SEEN_KEY = "blocked-first-seen";

let activation: Promise<boolean> | undefined;
let loading: Promise<void> | undefined;
let paths: { summary: string; health: string; watcher: string } | undefined;
let family: "dark" | "light" = "light";
let look: { seed: number; variant: string } = { seed: 0, variant: "galleon" };
let firstSeen: Record<string, number> = {};
let current: Forecast | undefined;
let summary: object | undefined;
let summaryText: string | undefined;
const files = new Map<string, { stamp: string | undefined; text: string | undefined }>();
let polling = false;
let tick = 0;
let frameTick = 0;
let site: { requestId: string; columns: number; working: boolean } | undefined;

function isActive($: EngineInterface): Promise<boolean> {
  if (activation === undefined) {
    activation = $.env.get("FM_TASK_ID").then(
      (value) => value === undefined || value === "",
      () => false,
    );
  }
  return activation;
}

async function readTheme($: EngineInterface): Promise<unknown> {
  try {
    return (await $.config.list()).find((row) => row.key === "theme")?.value;
  } catch {
    return undefined;
  }
}

/**
 * A file's text, re-read only when its size or mtime moved since the last read; a file
 * changed within SETTLED_MS keeps no stamp, so the next poll reads it again.
 */
async function follow($: EngineInterface, path: string, now: number): Promise<string | undefined> {
  const known = files.get(path);
  try {
    if (!(await $.fs.exists(path))) {
      files.delete(path);
      return undefined;
    }
    const stat = await $.fs.stat(path);
    const stamp = `${stat.size}:${stat.mtimeMs}`;
    if (known !== undefined && known.stamp === stamp) return known.text;
    const text = await $.fs.read(path);
    files.set(path, { stamp: now - stat.mtimeMs >= SETTLED_MS ? stamp : undefined, text });
    return text;
  } catch {
    return known?.text;
  }
}

async function poll($: EngineInterface): Promise<void> {
  if (paths === undefined || polling) return;
  polling = true;
  try {
    const now = await $.clock.now();
    const raw = await follow($, paths.summary, now);
    if (raw !== summaryText) {
      summaryText = raw;
      summary = parseSummary(raw);
    }
    const health = await follow($, paths.health, now);
    const watcher = await follow($, paths.watcher, now);

    const seen = trackBlocked(summary, firstSeen, now);
    if (JSON.stringify(seen) !== JSON.stringify(firstSeen)) {
      firstSeen = seen;
      await $.store.set(FIRST_SEEN_KEY, seen).catch(() => undefined);
    }
    const next = forecast({ summary, health, watcher, now, firstSeen }) as Forecast | undefined;
    if (next?.weather !== current?.weather || next?.reason !== current?.reason) {
      current = next;
      $.ui.invalidate("ui.render");
    }
  } finally {
    polling = false;
  }
}

async function repaint($: EngineInterface): Promise<void> {
  tick += 1;
  const mounted = site;
  if (mounted === undefined || current === undefined) return;
  if (!mounted.working && tick % IDLE_TICKS_PER_FRAME !== 0) return;
  frameTick += 1;
  const packed = packCells(sceneFrame(frameTick, current.weather, family, mounted.columns, look), mounted.columns);
  let shown: boolean;
  try {
    const result = await $.ui.blit({ requestId: mounted.requestId, key: RASTER_KEY, cells: packed.cells, columns: mounted.columns, rows: packed.rows });
    shown = result.deny === undefined;
  } catch {
    shown = false;
  }
  // Denied: the band no longer shows this Raster (collapsed, resized, a survey took it);
  // the next drawing mounts it again.
  if (!shown && site === mounted) site = undefined;
}

async function load($: EngineInterface): Promise<void> {
  const home = (await $.env.get("FM_HOME")) || (await $.env.get("FM_ROOT_OVERRIDE")) || `${(await $.env.get("HOME")) ?? ""}/Work/Git/firstmate`;
  const state = (await $.env.get("FM_STATE_OVERRIDE")) || `${home}/state`;
  paths = {
    summary: `${state}/home-summary.json`,
    health: `${state}/.supervision-host-health`,
    watcher: `${state}/.watcher-down`,
  };
  family = paletteFamily(await readTheme($));
  const seed = Math.floor(await $.clock.now()) % 0x7fffffff;
  look = { seed, variant: resolveVariant(await $.env.get("FLEET_WEATHER_SHIP"), seed) };
  try {
    const stored = await $.store.get(FIRST_SEEN_KEY);
    if (stored !== null && typeof stored === "object") firstSeen = stored as Record<string, number>;
  } catch {
    // An unreadable store only restarts the two-hour storm window.
  }
  await poll($);
  $.clock.every(POLL_MS, () => {
    void poll($);
  });
  $.clock.every(TICK_MS, () => {
    void repaint($);
  });
}

function ensureLoaded($: EngineInterface): Promise<void> {
  if (loading === undefined) loading = load($);
  return loading;
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    if (await isActive($)) await ensureLoaded($);
    return next(e);
  });

  // Follow a theme change: the next drawing and every later blit use the new family.
  on("config.set", { key: "theme" }, async ($, e, next) => {
    const result = await next(e);
    if (result.deny === undefined && (await isActive($))) {
      const chosen = paletteFamily(result.value);
      if (chosen !== family) {
        family = chosen;
        $.ui.invalidate("ui.render");
      }
    }
    return result;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (!(await isActive($))) return next(e);
    await ensureLoaded($);
    const forecastNow = current;
    if (e.surface !== "terminal" || e.props.hasSurvey || forecastNow === undefined || e.props.maxRows < SCENE_ROWS) {
      site = undefined;
      return next(e);
    }
    const columns = Math.max(1, Math.min(MAX_COLUMNS, e.props.bodyColumns));
    site = { requestId: e.requestId, columns, working: e.props.isWorking };
    const packed = packCells(sceneFrame(frameTick, forecastNow.weather, family, columns, look), columns);
    const { Box, Raster, Text } = $.ui.resolve(e);
    const scene = Raster({ key: RASTER_KEY, columns, rows: packed.rows, cells: packed.cells });
    if (e.props.maxRows < SCENE_ROWS + 1) return Box({ flexDirection: "column", children: scene });
    return Box({
      flexDirection: "column",
      children: [scene, Text({ dimColor: true, wrap: "truncate-end", children: [`${forecastNow.weather} · ${forecastNow.reason}`] })],
    });
  });
};
