import * as ebay from "./ebay";
import * as serpapi from "./serpapi";
import type {
  PriceRange,
  ProductListing,
  ShopResult,
  SourceName,
  SourceReport,
} from "./types";

export * from "./types";
export { ebayConfigured } from "./ebay";
export { serpapiConfigured } from "./serpapi";
export { isMenswearListing, rejectTitle } from "./menswear";

const SOURCES: Array<{
  name: SourceName;
  configured: () => boolean;
  search: typeof ebay.search;
}> = [
  { name: "ebay", configured: ebay.ebayConfigured, search: ebay.search },
  { name: "serpapi", configured: serpapi.serpapiConfigured, search: serpapi.search },
];

/**
 * How many of a run's queries each source is allowed to see.
 *
 * eBay's Browse API is generous enough that every query can go to it. SerpAPI's
 * free tier is 100 searches a month, and a run issues up to 10 queries — sending
 * all of them would make Google Shopping useful for ten runs and then dead.
 * Four keeps it alive for roughly twenty-five, and the queries are already
 * ordered by how central they are to the style, so the first four are the ones
 * worth spending on.
 */
const QUERY_CAP: Partial<Record<SourceName, number>> = { serpapi: 4 };

/** Exported for the test: the cap is a quota decision, so it needs pinning. */
export function queriesFor(source: SourceName, queries: string[]): string[] {
  const cap = QUERY_CAP[source];
  return cap === undefined ? queries : queries.slice(0, cap);
}

/** Titles vary in punctuation and casing across sources; compare on the bones. */
export function dedupeKey(item: ProductListing): string {
  const title = item.title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${title}|${Math.round(item.price)}`;
}

/**
 * Take turns, one item at a time.
 */
function roundRobin<T>(queues: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; ; i += 1) {
    let added = false;
    for (const queue of queues) {
      if (i < queue.length) {
        out.push(queue[i]);
        added = true;
      }
    }
    if (!added) return out;
  }
}

/**
 * Round-robin across the queries that produced results, so a single broad query
 * can't eat the whole candidate budget and starve the narrower ones — and,
 * within each query, across the sources that answered it.
 *
 * That second turn matters more than it looks. This used to bucket on the query
 * alone, and because eBay's results are merged ahead of Google Shopping's, every
 * bucket read [30 eBay, then 24 retail]. The round-robin drains position 0 of
 * each bucket, then position 1, and a 120 cap over 10 queries never gets past
 * position 12 — which eBay fills on its own. The result was that Google Shopping
 * could be configured, working, and billed, and not one of its listings ever
 * reached the candidate pool.
 */
export function interleaveByQuery(
  listings: ProductListing[],
  cap: number
): ProductListing[] {
  const byQuery = new Map<string, Map<SourceName, ProductListing[]>>();
  for (const item of listings) {
    const key = item.matchedQuery ?? "";
    let sources = byQuery.get(key);
    if (!sources) {
      sources = new Map();
      byQuery.set(key, sources);
    }
    const bucket = sources.get(item.source);
    if (bucket) bucket.push(item);
    else sources.set(item.source, [item]);
  }

  const queues = [...byQuery.values()].map((sources) => roundRobin([...sources.values()]));
  const out: ProductListing[] = [];
  let drained = false;

  while (out.length < cap && !drained) {
    drained = true;
    for (const queue of queues) {
      if (out.length >= cap) break;
      const next = queue.shift();
      if (next) {
        out.push(next);
        drained = false;
      }
    }
  }

  return out;
}

/**
 * Run every query against every configured source in parallel.
 *
 * A source that throws is reported and skipped — one dead source (expired eBay
 * token, SerpAPI quota) must never fail the whole request, because the other
 * source's results are still worth showing.
 */
export async function shop(
  queries: string[],
  range: PriceRange,
  opts: { perQueryLimit?: number; cap?: number } = {}
): Promise<ShopResult> {
  // A tight final list needs a wide pool to choose from, not a narrow one —
  // curation can only be selective if there is something to select between.
  const perQueryLimit = opts.perQueryLimit ?? 30;
  const cap = opts.cap ?? 120;

  const active = SOURCES.filter((source) => source.configured());
  const reports: SourceReport[] = SOURCES.filter((s) => !s.configured()).map((s) => ({
    source: s.name,
    configured: false,
    ok: true,
    count: 0,
  }));

  const settled = await Promise.all(
    active.map(async (source) => {
      const asked = queriesFor(source.name, queries);
      const results = await Promise.allSettled(
        asked.map((query) => source.search({ query, range, limit: perQueryLimit }))
      );

      const items: ProductListing[] = [];
      const errors: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") items.push(...result.value);
        else errors.push(result.reason?.message ?? String(result.reason));
      }

      // Only a total wipeout counts as a failed source; partial errors across
      // eight queries are normal and shouldn't be surfaced as breakage.
      const ok = asked.length === 0 || errors.length < asked.length;
      const report: SourceReport = {
        source: source.name,
        configured: true,
        ok,
        count: items.length,
        error: errors.length ? errors[0] : undefined,
      };
      return { items, report };
    })
  );

  for (const { report } of settled) reports.push(report);

  const seen = new Set<string>();
  const unique: ProductListing[] = [];
  for (const item of settled.flatMap((s) => s.items)) {
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return { listings: interleaveByQuery(unique, cap), reports };
}
