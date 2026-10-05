// Fleet weather: Firstmate's published fleet view folded into one of five skies.
//
// Pure, so `node --test` drives it with fixtures and ../hooks/register.ts only feeds it
// file text and the clock. The one source is `$FM_HOME/state/home-summary.json`
// (schema fm-secondmate-home-summary.v1), which Firstmate republishes on every
// watcher-observed status change, task spawn and teardown, and at least every 300 s;
// two supervision sidecars add health. The first matching row wins:
//
//   storm   a fresh `blocked` decision, a blocked crew, the supervision latch cooling
//           down, watcher downtime, or a summary nobody has republished for 10 min
//   rain    a crew whose validation failed or is fixing a red step, or a `blocked`
//           decision first seen more than two hours ago (the captain's decay rule)
//   clouds  a decision or captain hold waiting on the captain
//   night   no active crews
//   calm    crews working and nothing open

/** A `blocked` decision storms this long after it is first seen, then rains. */
export const BLOCKED_STORM_MS = 2 * 60 * 60 * 1000;

/** Twice FM_HOME_SUMMARY_INTERVAL's 300 s default: older means nothing is republishing. */
export const SUMMARY_STALE_MS = 10 * 60 * 1000;

/** @typedef {"storm" | "rain" | "clouds" | "night" | "calm"} Weather */
/** @typedef {{ weather: Weather, reason: string }} Forecast */

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value.filter(isObject) : []);
const text = (value) => (typeof value === "string" ? value : "");

/**
 * The summary's JSON when it is a home summary at all, else undefined: a missing,
 * unreadable, or foreign file means no fleet to forecast, and the mod draws nothing.
 * @param {string | undefined} raw
 */
export function parseSummary(raw) {
  if (raw === undefined) return undefined;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isObject(value) || typeof value.schema !== "string" || !value.schema.startsWith("fm-secondmate-home-summary.")) return undefined;
  return value;
}

/**
 * Whether `.supervision-host-health` reports the broken-session latch cooling down.
 * @param {string | undefined} raw
 */
export function supervisionCooling(raw) {
  const match = /^cooldown=(\d+)\s*$/m.exec(raw ?? "");
  return match !== null && Number(match[1]) > 0;
}

/**
 * Whether `.watcher-down` holds a downtime episode; a `handling` token is a wake in
 * progress, not downtime.
 * @param {string | undefined} raw
 */
export function watcherDown(raw) {
  return /^(pending|announced):downtime:/.test((raw ?? "").trim());
}

/** The key a blocked decision is remembered by between polls and sessions. */
export const blockedKey = (decision) => `${text(decision.id)}:${text(decision.key) || text(decision.summary)}`;

/**
 * The first-seen map carried forward: every open blocked decision keeps its first
 * sighting (or gains `now`), and a decision no longer open is forgotten.
 * @param {object | undefined} summary
 * @param {Record<string, number>} firstSeen
 * @param {number} now
 * @returns {Record<string, number>}
 */
export function trackBlocked(summary, firstSeen, now) {
  const next = {};
  for (const decision of list(summary?.decisions_open)) {
    if (decision.verb !== "blocked") continue;
    const key = blockedKey(decision);
    const seen = firstSeen[key];
    next[key] = typeof seen === "number" && Number.isFinite(seen) && seen <= now ? seen : now;
  }
  return next;
}

const named = (decision) => {
  const id = text(decision.id) || "a crew";
  const key = text(decision.key);
  return key ? `${id} (${key})` : id;
};

const withMore = (reasons) => (reasons.length > 1 ? `${reasons[0]} +${reasons.length - 1} more` : reasons[0]);

/**
 * The fleet's weather and the one-line reason the band shows beside it.
 * @param {{ summary: object | undefined, health?: string, watcher?: string, now: number, firstSeen?: Record<string, number> }} input
 * @returns {Forecast | undefined} undefined when there is no summary to read
 */
export function forecast({ summary, health, watcher, now, firstSeen = {} }) {
  if (summary === undefined) return undefined;
  const children = list(summary.active_children);
  const decisions = list(summary.decisions_open);

  const storm = [];
  const rain = [];
  const generated = typeof summary.generated_epoch === "number" ? summary.generated_epoch * 1000 : undefined;
  if (generated === undefined || now - generated > SUMMARY_STALE_MS) {
    const minutes = generated === undefined ? undefined : Math.floor((now - generated) / 60000);
    storm.push(minutes === undefined ? "fleet view has no timestamp" : `fleet view not refreshed for ${minutes} min`);
  }
  if (supervisionCooling(health)) storm.push("supervision cooling down after engine errors");
  if (watcherDown(watcher)) storm.push("watcher down");
  for (const decision of decisions) {
    if (decision.verb !== "blocked") continue;
    const seen = firstSeen[blockedKey(decision)] ?? now;
    if (now - seen < BLOCKED_STORM_MS) storm.push(`${named(decision)} blocked`);
    else rain.push(`${named(decision)} blocked for ${Math.floor((now - seen) / 3600000)}h+`);
  }
  for (const child of children) if (child.state === "blocked") storm.push(`${text(child.id) || "a crew"} blocked`);
  if (storm.length > 0) return { weather: "storm", reason: withMore(storm) };

  for (const child of children) {
    if (child.state === "failed") rain.push(`${text(child.id) || "a crew"} validation failed`);
    else if (child.doing === "validating (fixing)") rain.push(`${text(child.id) || "a crew"} fixing a red check`);
  }
  if (rain.length > 0) return { weather: "rain", reason: withMore(rain) };

  const waiting = decisions.filter((d) => d.verb === "needs-decision" || d.verb === "captain-hold").map((d) => `${named(d)} needs a decision`);
  if (waiting.length > 0) return { weather: "clouds", reason: withMore(waiting) };

  const active = typeof summary.counts?.active_children === "number" ? summary.counts.active_children : children.length;
  if (active === 0) return { weather: "night", reason: "fleet idle" };
  return { weather: "calm", reason: active === 1 ? "1 crew working" : `${active} crews working` };
}
