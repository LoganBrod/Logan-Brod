// Whether anybody is showing up, and what they do when they get here.
//
// Not a general analytics product and deliberately not one. It answers three
// questions and no others: how many people came today, where from, and how far
// down the funnel they got. Everything else an off-the-shelf tool would give
// you — sessions, heatmaps, cohorts — is a thing nobody would act on at this
// size, and every one of them costs another key.
//
// Nothing here identifies a person. Uniques are counted with a HyperLogLog,
// which is a fixed twelve kilobytes that can answer "how many distinct" and
// cannot answer "was this one of them" — so there is no visitor table to leak,
// and the count is approximate by about 1%, which is far inside the noise of
// the thing being measured.
//
// Every key is bounded. A day is one hash of counters plus one HLL plus one
// capped campaign hash, and every field name comes from an allowlist rather
// than from the request — the whole point being that a public write endpoint
// must not be able to make storage grow without limit.

import { createHash, randomBytes } from "node:crypto";

import { isEvent, type AnalyticsEvent } from "./analyticsEvents";
import { flatToHash, pipeline, redisConfigured } from "./redis";

/** Ninety days: long enough to see a launch and a month after it. */
const TTL_SECONDS = 90 * 24 * 60 * 60;

/** Distinct campaigns a single day will record before it stops listening. */
const MAX_CAMPAIGNS = 50;

export const dayKey = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);
const hashKey = (day: string) => `an:d:${day}`;
const uniqueKey = (day: string) => `an:u:${day}`;
const campaignKey = (day: string) => `an:c:${day}`;

/**
 * The routes worth counting separately, and everything else as one row.
 *
 * Bounded on purpose: `path` arrives from the browser, and a field name taken
 * from a request is a hash somebody can grow to any size they like. A closet
 * code is collapsed to `/closet/:code` for the same reason — six random
 * characters is unbounded by construction.
 */
const KNOWN_PATHS = new Set([
  "/",
  "/closet",
  "/closet/tools",
  "/closet/saved",
  "/accessories",
  "/colognes",
  "/calibrate",
  "/feedback",
]);

export function normalisePath(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "/other";
  const path = raw.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (KNOWN_PATHS.has(path)) return path;
  if (/^\/closet\/[A-Z0-9]{4,12}$/i.test(path)) return "/closet/:code";
  return "/other";
}

/**
 * Where somebody came from, as one of a fixed set of answers.
 *
 * The question this exists to answer is "did the TikTok work", so TikTok is
 * named and so is everything else that could plausibly send traffic. An
 * unrecognised host is "other" rather than its own row: the long tail of
 * referrers is both unbounded and, at this size, noise.
 */
const SOURCES: Array<[RegExp, string]> = [
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, "x"],
  [/(^|\.)(facebook\.com|fb\.me)$/, "facebook"],
  [/(^|\.)pinterest\.[a-z.]+$/, "pinterest"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org)$/, "search"],
];

/**
 * @param raw   the browser's `document.referrer`
 * @param self  our own hostname, so a click from one page to another is not
 *              counted as somebody arriving
 */
export function normaliseSource(raw: unknown, self?: string | null): string {
  if (typeof raw !== "string" || !raw.trim()) return "direct";

  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // Some apps hand over a referrer that is not a URL. It came from
    // somewhere, and we cannot say where.
    return "other";
  }

  if (self && host === self.toLowerCase().replace(/^www\./, "")) return "internal";
  for (const [pattern, name] of SOURCES) if (pattern.test(host)) return name;
  return "other";
}

/**
 * A campaign tag, for telling one video from the next.
 *
 * Tight charset, short, lowercase. Put `?c=blue-jacket` on the link in a bio
 * and that video gets its own row.
 */
export function normaliseCampaign(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,23}$/.test(tag) ? tag : null;
}

/**
 * Days whose campaign list is full, remembered in the process.
 *
 * The cap has to be enforced without paying for a round trip on every single
 * beacon, so the write pipeline asks for `HLEN` as its last command and the
 * answer closes the day here. One long-lived process on Railway means this is
 * a real cache rather than a coin flip; a restart re-learns it on the next
 * beacon, having over-recorded by at most one.
 */
const closedCampaigns = new Set<string>();

/**
 * A salt nobody outside this process knows, rotated with the day.
 *
 * Falls back to random bytes minted at boot, which is not a weakness: the salt
 * only has to be unguessable, and one that changes on deploy costs at most a
 * double-count of people who were mid-visit. Set ANALYTICS_SALT if you would
 * rather it survive a restart.
 */
const SALT = process.env.ANALYTICS_SALT || randomBytes(32).toString("hex");

/**
 * Who to count this as, without a cookie and without storing anything.
 *
 * This began as the taste cookie, which was wrong in the one place it mattered:
 * a first-time visitor to the marketing page has never been given one, so the
 * whole audience arriving from a video counted as zero people. It is now a
 * hash of the day, a secret salt, the address and the browser string — the
 * same shape Plausible uses, and for the same two reasons. It works for
 * somebody who has never touched the product, and it cannot be turned back
 * into a person: the salt is secret, the input rotates every midnight, and the
 * digest is only ever handed to a HyperLogLog that cannot be read back.
 *
 * The cost is that it is a count of *devices on a network per day*, so an
 * office behind one address reads low and a phone moving between wifi and
 * cellular reads as two. At the size this is measuring, that is noise.
 */
export function visitorKey(ip: string | null, userAgent: string | null, day = dayKey()): string | null {
  if (!ip && !userAgent) return null;
  return createHash("sha256")
    .update(`${day}|${SALT}|${ip ?? ""}|${(userAgent ?? "").slice(0, 200)}`)
    .digest("hex")
    .slice(0, 32);
}

export interface Hit {
  /** A pageview, already normalised. Absent for a bare event. */
  path?: string;
  event?: AnalyticsEvent;
  source?: string;
  campaign?: string | null;
  /** From `visitorKey`. Counted, never stored. */
  visitor?: string | null;
  /** Whether they arrived carrying a Clozet cookie, so had been here before. */
  returning?: boolean;
}

/**
 * Record one hit. Never throws.
 *
 * One pipeline, so a pageview is one round trip however many counters it
 * touches. Increments rather than read-modify-write for the same reason
 * `lib/yield.ts` is: fifty people arriving at once must not clobber each
 * other's count, and the load simulation has already shown once what happens
 * when they can.
 */
export async function recordHit(hit: Hit): Promise<void> {
  if (!redisConfigured()) return;

  const day = dayKey();
  const key = hashKey(day);
  const commands: Array<Array<string | number>> = [];

  if (hit.path) {
    commands.push(["HINCRBY", key, "views", 1]);
    commands.push(["HINCRBY", key, `path:${hit.path}`, 1]);
    // Source and first-or-returning belong to the arrival, not to every page
    // of it — the caller decides which beacon is the entry one.
    if (hit.source) commands.push(["HINCRBY", key, `src:${hit.source}`, 1]);
    commands.push(["HINCRBY", key, hit.returning ? "returning" : "new", 1]);
  }

  if (hit.event && isEvent(hit.event)) {
    commands.push(["HINCRBY", key, `ev:${hit.event}`, 1]);
  }

  if (!commands.length) return;
  commands.push(["EXPIRE", key, TTL_SECONDS]);

  if (hit.visitor) {
    commands.push(["PFADD", uniqueKey(day), hit.visitor]);
    commands.push(["EXPIRE", uniqueKey(day), TTL_SECONDS]);
  }

  const wantsCampaign = Boolean(hit.campaign && hit.path && !closedCampaigns.has(day));
  if (wantsCampaign) {
    commands.push(["HINCRBY", campaignKey(day), hit.campaign!, 1]);
    commands.push(["EXPIRE", campaignKey(day), TTL_SECONDS]);
    commands.push(["HLEN", campaignKey(day)]);
  }

  try {
    const results = await pipeline<number>(commands);
    if (wantsCampaign && Number(results[results.length - 1]) >= MAX_CAMPAIGNS) {
      closedCampaigns.add(day);
    }
  } catch {
    // A dropped hit is a rounding error. A failed request because of one is not.
  }
}

export interface DayTraffic {
  day: string;
  views: number;
  visitors: number;
  new: number;
  returning: number;
  sources: Record<string, number>;
  paths: Record<string, number>;
  events: Record<string, number>;
}

export interface TrafficReport {
  days: DayTraffic[];
  totals: Omit<DayTraffic, "day">;
  campaigns: Array<{ tag: string; hits: number }>;
}

const num = (value: string | undefined) => Number(value ?? 0) || 0;

function pick(hash: Record<string, string>, prefix: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [field, value] of Object.entries(hash)) {
    if (field.startsWith(prefix)) out[field.slice(prefix.length)] = num(value);
  }
  return out;
}

/**
 * The last `days` days, oldest first.
 *
 * Every day is one HGETALL and one PFCOUNT, batched into a single pipeline —
 * thirty days is two round trips rather than sixty.
 */
export async function readTraffic(days = 30): Promise<TrafficReport> {
  const empty: TrafficReport = {
    days: [],
    totals: { views: 0, visitors: 0, new: 0, returning: 0, sources: {}, paths: {}, events: {} },
    campaigns: [],
  };
  if (!redisConfigured()) return empty;

  const span = Math.min(Math.max(1, Math.round(days)), 90);
  const wanted: string[] = [];
  for (let back = span - 1; back >= 0; back -= 1) {
    wanted.push(dayKey(Date.now() - back * 24 * 60 * 60 * 1000));
  }

  const commands: Array<Array<string | number>> = [];
  for (const day of wanted) {
    commands.push(["HGETALL", hashKey(day)]);
    commands.push(["PFCOUNT", uniqueKey(day)]);
  }
  commands.push(["HGETALL", campaignKey(dayKey())]);

  let results: unknown[];
  try {
    results = await pipeline<unknown>(commands);
  } catch {
    return empty;
  }

  const report: DayTraffic[] = wanted.map((day, index) => {
    const hash = flatToHash(results[index * 2]) ?? {};
    return {
      day,
      views: num(hash.views),
      visitors: Number(results[index * 2 + 1]) || 0,
      new: num(hash.new),
      returning: num(hash.returning),
      sources: pick(hash, "src:"),
      paths: pick(hash, "path:"),
      events: pick(hash, "ev:"),
    };
  });

  const totals = report.reduce(
    (sum, day) => {
      sum.views += day.views;
      // Summed rather than unioned: two HLLs can be merged, but the answer to
      // "how many people this month" is not what a launch is asking, and
      // pretending a sum is a distinct count would be the lie. The report
      // labels this one "visits", not "people".
      sum.visitors += day.visitors;
      sum.new += day.new;
      sum.returning += day.returning;
      for (const [name, n] of Object.entries(day.sources)) sum.sources[name] = (sum.sources[name] ?? 0) + n;
      for (const [name, n] of Object.entries(day.paths)) sum.paths[name] = (sum.paths[name] ?? 0) + n;
      for (const [name, n] of Object.entries(day.events)) sum.events[name] = (sum.events[name] ?? 0) + n;
      return sum;
    },
    { views: 0, visitors: 0, new: 0, returning: 0, sources: {}, paths: {}, events: {} } as Omit<DayTraffic, "day">
  );

  const campaignHash = flatToHash(results[results.length - 1]) ?? {};
  const campaigns = Object.entries(campaignHash)
    .map(([tag, value]) => ({ tag, hits: num(value) }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 20);

  return { days: report, totals, campaigns };
}
