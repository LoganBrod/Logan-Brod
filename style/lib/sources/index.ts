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
 * Round-robin across the queries that produced results, so a single broad query
 * can't eat the whole candidate budget and starve the narrower ones.
 */
export function interleaveByQuery(
  listings: ProductListing[],
  cap: number
): ProductListing[] {
  const buckets = new Map<string, ProductListing[]>();
  for (const item of listings) {
    const key = item.matchedQuery ?? "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const queues = [...buckets.values()];
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
      const results = await Promise.allSettled(
        queries.map((query) => source.search({ query, range, limit: perQueryLimit }))
      );

      const items: ProductListing[] = [];
      const errors: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") items.push(...result.value);
        else errors.push(result.reason?.message ?? String(result.reason));
      }

      // Only a total wipeout counts as a failed source; partial errors across
      // eight queries are normal and shouldn't be surfaced as breakage.
      const ok = errors.length < queries.length;
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
