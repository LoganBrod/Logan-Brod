// What each search query actually produces.
//
// Until now nothing in this app measured whether a recommendation was any
// good. Every change to the reader's prompt, every cap on footwear, every
// fix to how brands are framed was reasoning, not evidence - there was no way
// to see which of the ten searches a run makes turn into pieces people keep
// and which turn into pieces people scroll past.
//
// This is that measurement. A query is followed from the moment it is written:
//
//   found   - listings the marketplaces returned for it
//   viewed  - of those, how many the judge was actually shown (the pool is
//             capped, so not every listing is looked at)
//   picked  - of those, how many cleared the floor and reached a rail
//   shown   - of those, how many a person actually scrolled to
//   opened  - clicked the detail panel
//   clicked - clicked through to the listing
//   yes/no  - voted on
//
// Aggregated across everyone, because the question is about the searches, not
// about a person: "waxed cotton field jacket olive" either produces kept
// pieces or it doesn't. Per-person taste lives in lib/taste.ts and is a
// different question.
//
// Storage is a Redis hash per query, updated with HINCRBY, plus a set for the
// index and a capped list for run summaries. The first version kept one JSON
// value per query and rewrote it on every update, on the theory that a lost
// increment out of a hundred does not change which searches are good. The
// load simulation showed the theory was wrong by an order of magnitude: ten
// queries recorded at once from one run, and fifty runs at once, clobbered
// each other's copy of the index until forty-seven of fifty-one searches were
// missing from it. Increments and set-adds cannot lose each other, so every
// write here is one of those, batched into a single round trip.

import { flatToHash, listRange, pipeline, redisConfigured, setMembers } from "./redis";

export type YieldSignal = "shown" | "opened" | "clicked" | "yes" | "no";

export interface QueryYield {
  query: string;
  /** Distinct runs this query was part of. */
  runs: number;
  found: number;
  viewed: number;
  picked: number;
  /** Sum of judge scores over picked, for a mean. */
  scoreSum: number;
  shown: number;
  opened: number;
  clicked: number;
  yes: number;
  no: number;
  /** ISO timestamps: first and most recent sighting. */
  first: string;
  last: string;
}

/** One run's per-query outcome, as the client saw it end to end. */
export interface RunSummary {
  runId: string;
  at: string;
  /** How many pieces reached the rail. */
  picks: number;
  /** Whether the second search fired, and what it added. */
  requeried: boolean;
  addedByRequery: number;
  queries: Array<{ query: string; slot?: string; found: number; viewed: number; picked: number }>;
}

/** Ninety days: long enough to compare a prompt change against the month before it. */
const YIELD_TTL_SECONDS = 90 * 24 * 60 * 60;
/** How many run summaries are kept, newest first. */
const MAX_RUNS = 300;

/**
 * Queries are compared on their bones.
 *
 * The reader writes "Waxed cotton field jacket, olive" one day and "waxed
 * cotton field jacket olive" the next; those are the same search and their
 * outcomes belong together. Punctuation and case go, whitespace collapses,
 * and the result is short enough to be a key.
 */
export function slugOf(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Run ids are minted in the browser; only the shape is trusted. */
export function isValidRunId(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(raw);
}

const key = (slug: string) => `yield:q:${slug}`;
const INDEX_KEY = "yield:index";
const RUNS_KEY = "yield:runs";

/** The counters a delta may carry. Everything else on the record is derived or a timestamp. */
const COUNTERS = ["runs", "found", "viewed", "picked", "scoreSum", "shown", "opened", "clicked", "yes", "no"] as const;
type Counter = (typeof COUNTERS)[number];

/**
 * The commands that apply one delta to one query's hash. Pure, so the shape
 * of a write can be tested without Redis: every counter becomes an increment,
 * the timestamps are set-if-absent and set, the index gains the slug, and
 * both keys get their expiry refreshed.
 */
export function deltaCommands(slug: string, query: string, delta: Partial<QueryYield>, now: string): Array<Array<string | number>> {
  const k = key(slug);
  const commands: Array<Array<string | number>> = [
    ["HSETNX", k, "query", query],
    ["HSETNX", k, "first", now],
    ["HSET", k, "last", now],
  ];
  for (const field of COUNTERS) {
    const add = delta[field];
    if (typeof add !== "number" || !Number.isFinite(add) || add === 0) continue;
    commands.push(field === "scoreSum" ? ["HINCRBYFLOAT", k, field, add] : ["HINCRBY", k, field, Math.round(add)]);
  }
  commands.push(["EXPIRE", k, YIELD_TTL_SECONDS], ["SADD", INDEX_KEY, slug], ["EXPIRE", INDEX_KEY, YIELD_TTL_SECONDS]);
  return commands;
}

/** A hash read back from Redis, as a record. Null for an empty or missing hash. */
export function fromHash(hash: Record<string, string> | null): QueryYield | null {
  if (!hash || !hash.query) return null;
  const num = (field: Counter) => {
    const n = Number(hash[field]);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    query: hash.query,
    runs: num("runs"),
    found: num("found"),
    viewed: num("viewed"),
    picked: num("picked"),
    scoreSum: num("scoreSum"),
    shown: num("shown"),
    opened: num("opened"),
    clicked: num("clicked"),
    yes: num("yes"),
    no: num("no"),
    first: hash.first ?? hash.last ?? "",
    last: hash.last ?? hash.first ?? "",
  };
}

async function touch(query: string, delta: Partial<QueryYield>): Promise<void> {
  if (!redisConfigured()) return;
  const slug = slugOf(query);
  if (!slug) return;
  try {
    await pipeline(deltaCommands(slug, query, delta, new Date().toISOString()));
  } catch {
    // Best effort. A measurement that can break a run is worse than no
    // measurement.
  }
}

// ---------------------------------------------------------------- recording

/** After the marketplaces answer: how many listings each query produced. */
export async function recordFound(found: Array<{ query: string; found: number }>): Promise<void> {
  await Promise.all(found.map(({ query, found }) => touch(query, { runs: 1, found })));
}

/**
 * After a curation batch: what the judge saw and what it kept, attributed to
 * the query that found each piece.
 */
export async function recordJudged(
  viewed: Array<{ matchedQuery?: string }>,
  picked: Array<{ matchedQuery?: string; score: number }>
): Promise<void> {
  const delta = new Map<string, Partial<QueryYield>>();
  const bump = (q: string | undefined, d: Partial<QueryYield>) => {
    if (!q) return;
    const cur = delta.get(q) ?? {};
    for (const [k, v] of Object.entries(d)) {
      (cur as Record<string, number>)[k] = ((cur as Record<string, number>)[k] ?? 0) + (v as number);
    }
    delta.set(q, cur);
  };
  for (const item of viewed) bump(item.matchedQuery, { viewed: 1 });
  for (const item of picked) bump(item.matchedQuery, { picked: 1, scoreSum: item.score });
  await Promise.all([...delta].map(([q, d]) => touch(q, d)));
}

/** A person's reaction to a piece, credited to the query that found it. */
export async function recordSignal(query: string | undefined, signal: YieldSignal): Promise<void> {
  if (!query) return;
  await touch(query, { [signal]: 1 });
}

/** One finished run, as the client saw it. Newest first, capped, in one round trip. */
export async function recordRun(summary: RunSummary): Promise<void> {
  if (!redisConfigured()) return;
  try {
    await pipeline([
      ["LPUSH", RUNS_KEY, JSON.stringify(summary)],
      ["LTRIM", RUNS_KEY, 0, MAX_RUNS - 1],
      ["EXPIRE", RUNS_KEY, YIELD_TTL_SECONDS],
    ]);
  } catch {
    // Best effort, as above.
  }
}

// ------------------------------------------------------------------ reading

export interface QueryReportRow extends QueryYield {
  /** picked / viewed: how often the judge kept what this search found. */
  pickRate: number;
  /** (clicked + yes) / shown: how often a person acted on what it produced. */
  keepRate: number;
  meanScore: number;
}

export interface YieldReport {
  queries: QueryReportRow[];
  runs: RunSummary[];
}

/**
 * Everything, ranked so the searches that turn into kept pieces come first.
 *
 * Ranked by keep rate where there is enough to rank on, and by pick rate
 * otherwise, so a brand-new query is not put above a proven one because its
 * two shown pieces both happened to be clicked.
 */
export async function readYieldReport(): Promise<YieldReport> {
  if (!redisConfigured()) return { queries: [], runs: [] };
  const slugs = await setMembers(INDEX_KEY);
  const records: QueryYield[] = [];
  // A hundred hashes per round trip; the index holds at most a few thousand.
  for (let i = 0; i < slugs.length; i += 100) {
    const chunk = slugs.slice(i, i + 100);
    const flats = await pipeline<string[]>(chunk.map((slug) => ["HGETALL", key(slug)]));
    for (const flat of flats) {
      const record = fromHash(flatToHash(flat));
      if (record) records.push(record);
    }
  }
  const queries = records
    .map((r) => ({
      ...r,
      pickRate: r.viewed ? r.picked / r.viewed : 0,
      keepRate: r.shown ? (r.clicked + r.yes) / r.shown : 0,
      meanScore: r.picked ? r.scoreSum / r.picked : 0,
    }))
    .sort((a, b) => {
      const aRanked = a.shown >= 10, bRanked = b.shown >= 10;
      if (aRanked !== bRanked) return aRanked ? -1 : 1;
      return aRanked ? b.keepRate - a.keepRate : b.pickRate - a.pickRate;
    });
  const runs = (await listRange(RUNS_KEY, 0, MAX_RUNS - 1))
    .map((raw) => {
      try {
        return JSON.parse(raw) as RunSummary;
      } catch {
        return null;
      }
    })
    .filter((r): r is RunSummary => Boolean(r));
  return { queries, runs };
}
