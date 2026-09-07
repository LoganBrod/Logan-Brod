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
// Storage is one JSON value per query, read and rewritten on each update.
// That is not race-free - six curation batches land at once and two can touch
// the same query - and it is accepted: this is analytics, a lost increment
// out of a hundred does not change which searches are good, and the
// alternative is a hundred atomic round trips inside the slowest route in the
// app. The counts are for reading trends, not for billing.

import { getJson, redisConfigured, setJson } from "./redis";

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
/** How many queries the index remembers. Past this the oldest fall off. */
const MAX_INDEXED = 2000;
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

function empty(query: string, now: string): QueryYield {
  return {
    query,
    runs: 0,
    found: 0,
    viewed: 0,
    picked: 0,
    scoreSum: 0,
    shown: 0,
    opened: 0,
    clicked: 0,
    yes: 0,
    no: 0,
    first: now,
    last: now,
  };
}

/**
 * Apply a set of increments to one query's record. Pure, so it can be tested
 * without Redis; `touch` is what every recording path calls.
 */
export function merge(current: QueryYield | null, query: string, delta: Partial<QueryYield>, now: string): QueryYield {
  const base = current ?? empty(query, now);
  const next: QueryYield = { ...base, last: now };
  for (const field of ["runs", "found", "viewed", "picked", "scoreSum", "shown", "opened", "clicked", "yes", "no"] as const) {
    const add = delta[field];
    if (typeof add === "number" && Number.isFinite(add) && add !== 0) next[field] = base[field] + add;
  }
  return next;
}

async function touch(query: string, delta: Partial<QueryYield>): Promise<void> {
  if (!redisConfigured()) return;
  const slug = slugOf(query);
  if (!slug) return;
  const now = new Date().toISOString();
  try {
    const current = await getJson<QueryYield>(key(slug));
    const next = merge(current, query, delta, now);
    await setJson(key(slug), next, YIELD_TTL_SECONDS);
    if (!current) await index(slug);
  } catch {
    // Best effort. A measurement that can break a run is worse than no
    // measurement.
  }
}

/** Newest first, deduplicated, capped. */
async function index(slug: string): Promise<void> {
  const list = (await getJson<string[]>(INDEX_KEY)) ?? [];
  if (list.includes(slug)) return;
  await setJson(INDEX_KEY, [slug, ...list].slice(0, MAX_INDEXED), YIELD_TTL_SECONDS);
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

/** One finished run, as the client saw it. Kept newest first, capped. */
export async function recordRun(summary: RunSummary): Promise<void> {
  if (!redisConfigured()) return;
  try {
    const runs = (await getJson<RunSummary[]>(RUNS_KEY)) ?? [];
    await setJson(RUNS_KEY, [summary, ...runs.filter((r) => r.runId !== summary.runId)].slice(0, MAX_RUNS), YIELD_TTL_SECONDS);
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
  const slugs = (await getJson<string[]>(INDEX_KEY)) ?? [];
  const records = await Promise.all(slugs.map((slug) => getJson<QueryYield>(key(slug))));
  const queries = records
    .filter((r): r is QueryYield => Boolean(r))
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
  const runs = (await getJson<RunSummary[]>(RUNS_KEY)) ?? [];
  return { queries, runs };
}
