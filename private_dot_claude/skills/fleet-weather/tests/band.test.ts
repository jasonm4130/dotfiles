// The mod through the engine (`claude plugin test`): what the band draws from a fleet,
// the worker no-op, the blit loop and the two-hour storm decay on the mocked clock.
// The forecast and scene themselves are covered by tests/fleet-weather.test.mjs in the
// dotfiles repo under `node --test`.
import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import { resolveVariant, sceneFrame } from "../lib/galleon.mjs";
import { packCells } from "../lib/pack.mjs";

const HOME = "/fm";
const NOW = 1791159267 * 1000;
const SUMMARY = `${HOME}/state/home-summary.json`;

const BAND = {
  plugin: "fleet-weather",
  surface: "terminal",
  component: "AbovePrompt",
  props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 19 }, view: {} },
} as const;

function summary(decisions: object[], generated = NOW / 1000): string {
  return JSON.stringify({
    schema: "fm-secondmate-home-summary.v1",
    generated_epoch: generated,
    active_children: [{ id: "crew-a", state: "working", doing: "harness busy (claude-hook)" }],
    decisions_open: decisions,
    counts: { active_children: 1, decisions_open: decisions.length },
  });
}

/**
 * A Firstmate home on disk, beneath the plugin (`files` maps a path to its text and
 * mtime), and
 * the engine's own band: an empty Box keyed `engine-band`, drawn when the mod passes.
 */
function home(on: On, files: Map<string, { text: string; mtimeMs: number }>) {
  on("fs.exists", ($, e) => ({ value: files.has(e.path) }));
  on("fs.stat", ($, e) => {
    const file = files.get(e.path);
    return file === undefined ? { deny: `ENOENT ${e.path}` } : { value: { kind: "file" as const, size: file.text.length, mtimeMs: file.mtimeMs, isLink: false } };
  });
  on("fs.read", ($, e) => {
    const file = files.get(e.path);
    return file === undefined ? { deny: `ENOENT ${e.path}` } : { value: file.text };
  });
  on("ui.render", { component: "AbovePrompt" }, ($, e) => $.ui.resolve(e).Box({ key: "engine-band" }));
}

test("the band draws the galleon at the band's width with the weather's reason", async ($, on) => {
  mock.clock(on, { now: NOW });
  mock.store(on);
  mock.env(on, { FM_HOME: HOME });
  home(on, new Map([[SUMMARY, { text: summary([{ id: "endurebyte", key: "eb-gh-token-checks", verb: "blocked" }]), mtimeMs: NOW - 60_000 }]]));

  const ui = await $.ui.mount(BAND);
  const raster = await ui.find({ type: "Raster" });
  expect(raster?.props.columns).toBe(80);
  expect(raster?.props.rows).toBe(6);
  expect(typeof raster?.props.cells).toBe("string");
  expect((await ui.find({ type: "Text", text: /storm · endurebyte \(eb-gh-token-checks\) blocked/ })) !== undefined).toBe(true);
  await ui.unmount();
});

test("a Firstmate worker draws nothing", async ($, on) => {
  mock.clock(on, { now: NOW });
  mock.store(on);
  mock.env(on, { FM_HOME: HOME, FM_TASK_ID: "some-task" });
  home(on, new Map([[SUMMARY, { text: summary([]), mtimeMs: NOW - 60_000 }]]));

  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Raster" })).toBe(undefined);
  expect((await ui.find({ key: "engine-band" })) !== undefined).toBe(true);
  await ui.unmount();
});

test("a home with no summary draws nothing", async ($, on) => {
  mock.clock(on, { now: NOW });
  mock.store(on);
  mock.env(on, { FM_HOME: HOME });
  home(on, new Map());

  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Raster" })).toBe(undefined);
  expect((await ui.find({ key: "engine-band" })) !== undefined).toBe(true);
  await ui.unmount();
});

test("the sea animates through blits at the drawn size", async ($, on) => {
  const clock = mock.clock(on, { now: NOW });
  mock.store(on);
  mock.env(on, { FM_HOME: HOME });
  home(on, new Map([[SUMMARY, { text: summary([]), mtimeMs: NOW - 60_000 }]]));
  const blits: { columns: number; rows: number; key: string }[] = [];
  on("ui.blit", ($, e) => {
    blits.push({ columns: e.columns ?? 0, rows: e.rows ?? 0, key: e.key });
    return { value: {} };
  });

  const ui = await $.ui.mount(BAND);
  await clock.advance(1000);
  expect(blits.length > 0).toBe(true);
  expect(blits[0]).toEqual({ columns: 80, rows: 6, key: "fleet-weather-galleon" });
  await ui.unmount();
});

/** The Raster cells the band mounts for a one-crew calm fleet, with extra env. */
async function bandCells($: Parameters<Parameters<typeof test>[1]>[0], on: On, env: Record<string, string>): Promise<unknown> {
  mock.clock(on, { now: NOW });
  mock.store(on);
  mock.env(on, { FM_HOME: HOME, ...env });
  home(on, new Map([[SUMMARY, { text: summary([]), mtimeMs: NOW - 60_000 }]]));
  const ui = await $.ui.mount(BAND);
  const cells = (await ui.find({ type: "Raster" }))?.props.cells;
  await ui.unmount();
  return cells;
}
const SEED = NOW % 0x7fffffff;
const expected = (variant: string) => packCells(sceneFrame(0, "calm", "light", 80, { seed: SEED, variant }), 80).cells;

test("FLEET_WEATHER_SHIP pins the vessel, whatever its case", async ($, on) => {
  expect(await bandCells($, on, { FLEET_WEATHER_SHIP: " Junk " })).toBe(expected("junk"));
});

test("without a pin the session's seed picks the vessel", async ($, on) => {
  expect(await bandCells($, on, { FLEET_WEATHER_SHIP: "dinghy" })).toBe(expected(resolveVariant(undefined, SEED)));
});

test("a blocked decision storms for two hours from first sight, then rains", async ($, on) => {
  const clock = mock.clock(on, { now: NOW });
  // First seen in an earlier session, 2 h less 10 s ago: the stamp outlives restarts.
  mock.store(on, { "blocked-first-seen": { "endurebyte:eb-x": NOW - 2 * 60 * 60 * 1000 + 10_000 } });
  mock.env(on, { FM_HOME: HOME });
  home(on, new Map([[SUMMARY, { text: summary([{ id: "endurebyte", key: "eb-x", verb: "blocked" }]), mtimeMs: NOW - 60_000 }]]));
  on("ui.blit", () => ({ value: {} }));

  const ui = await $.ui.mount(BAND);
  expect((await ui.find({ type: "Text", text: /^storm · endurebyte \(eb-x\) blocked$/ })) !== undefined).toBe(true);

  await clock.advance(15_000);
  await ui.redraw();
  expect((await ui.find({ type: "Text", text: /^rain · endurebyte \(eb-x\) blocked for 2h\+$/ })) !== undefined).toBe(true);
  await ui.unmount();
});
