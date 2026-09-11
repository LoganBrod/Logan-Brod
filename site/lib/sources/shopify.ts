// The brands' own shops.
//
// eBay is a marketplace and Google Shopping is an index of one. Neither is a
// brand, and "nobody just shops on eBay" is a fair thing to say about a tool
// that is meant to find you clothes worth owning.
//
// Every Shopify store publishes its whole catalogue at `/products.json`. It is
// the store's own endpoint, documented and served deliberately, rather than a
// page scraped for what it happens to contain - and a large share of the
// independent menswear worth recommending runs on Shopify. So this source
// fetches a brand's catalogue once a day, keeps it, and searches it here.
//
// Three things follow from that shape.
//
// It is not a search API. The endpoint returns everything, paginated, so
// matching happens locally against the title, type, tags and vendor. That is
// cruder than eBay's relevance and it does not matter much: this pool goes to
// the same judge as the others, and the judge decides on the photograph.
//
// It is new stock at full price, which the other two mostly are not. That is a
// change to what Clozet is, not just to where it looks, and the copy that says
// "everything here is somebody else's listing" has to move with it.
//
// It is off unless SHOPIFY_STORES names some domains. A store that has
// disabled the endpoint, moved off Shopify, or simply cannot be reached is
// skipped without failing the run - one dead brand must never cost the others.

import { getJson, redisConfigured, setJson } from "../redis";
import { rejectTitle } from "./menswear";
import type { ProductListing, SourceSearchOptions } from "./types";

/** Domains to read, comma-separated. Bare hosts: `taylorstitch.com`. */
function stores(): string[] {
  return (process.env.SHOPIFY_STORES ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean)
    .slice(0, MAX_STORES);
}

export function shopifyConfigured(): boolean {
  return stores().length > 0;
}

/** More than this and one run's catalogue refresh becomes the slowest thing in the app. */
const MAX_STORES = 24;
/** Pages of 250. Four covers all but the largest catalogues. */
const MAX_PAGES = 4;
const PAGE_SIZE = 250;
/** A catalogue changes slowly; stock does not, which is why availability is re-read from it rather than trusted forever. */
const CATALOGUE_TTL_SECONDS = 24 * 60 * 60;
/**
 * The most one store may occupy.
 *
 * With a couple of brands this never mattered. With twenty-seven it is the
 * difference between a few megabytes in Redis and a bill: a thousand-product
 * catalogue is about a third of a megabyte once trimmed, and Upstash charges
 * for what it holds and what it moves.
 */
const MAX_GARMENTS_PER_STORE = 400;
/**
 * Stores read at once.
 *
 * Twenty-seven simultaneous requests from one address is how this turns into
 * something a brand blocks. Six is the same bound the probe uses, and for the
 * same reason.
 */
const STORE_CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 12_000;

/** What we keep of a product. The rest of the payload is description HTML and variant noise. */
interface Garment {
  id: string;
  title: string;
  vendor: string;
  type: string;
  tags: string[];
  handle: string;
  price: number;
  image?: string;
}

interface ShopifyVariant {
  price?: string;
  available?: boolean;
}

interface ShopifyProduct {
  id?: number | string;
  title?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  handle?: string;
  variants?: ShopifyVariant[];
  images?: Array<{ src?: string }>;
}

/**
 * One page of a store's catalogue, trimmed.
 *
 * Written defensively on purpose: this is the one shape in the app that comes
 * from a third party's own server rather than from a documented API contract,
 * and a store on an older Shopify version or a custom theme can leave any of
 * these out. Anything missing a title, a price or a photograph is not a
 * garment we can show, so it is dropped rather than patched up.
 */
export interface Dropped {
  /** Products in the payload, before any of this. */
  seen: number;
  malformed: number;
  /** Rejected by the menswear title filter - womenswear, lots, and the rest. */
  title: number;
  soldOut: number;
  noImage: number;
}

/**
 * The same parse, with a note of what it threw away and why.
 *
 * A brand that answers with two hundred products and no usable garments is
 * either the wrong brand or a filter being too strict, and from the outside
 * those look identical. `scripts/shopify-probe.mjs` prints this breakdown so
 * the difference is visible before somebody spends an evening guessing.
 *
 * It exists rather than a second copy of the rules in the probe, because a
 * probe with its own idea of what counts as a garment would cheerfully report
 * a catalogue the app cannot read.
 */
export function explainCatalogue(
  raw: unknown,
  domain: string
): { garments: Garment[]; dropped: Dropped } {
  const products = (raw as { products?: ShopifyProduct[] } | null)?.products;
  const dropped: Dropped = { seen: 0, malformed: 0, title: 0, soldOut: 0, noImage: 0 };
  if (!Array.isArray(products)) return { garments: [], dropped };
  dropped.seen = products.length;

  const out: Garment[] = [];
  for (const product of products) {
    // A null or a string where an object should be. Third-party payloads have
    // no contract, and the whole point of this function is to survive that.
    if (!product || typeof product !== "object") {
      dropped.malformed += 1;
      continue;
    }
    const title = typeof product.title === "string" ? product.title.trim() : "";
    if (!title) {
      dropped.malformed += 1;
      continue;
    }
    if (rejectTitle(title)) {
      dropped.title += 1;
      continue;
    }

    // The cheapest variant that is actually buyable. A sold-out product with a
    // price is still a product nobody can have.
    const prices = (product.variants ?? [])
      .filter((v) => v.available !== false)
      .map((v) => Number(v.price))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!prices.length) {
      dropped.soldOut += 1;
      continue;
    }

    const image = product.images?.find((i) => typeof i.src === "string")?.src;
    if (!image) {
      dropped.noImage += 1;
      continue;
    }

    const tags = Array.isArray(product.tags)
      ? product.tags.filter((t): t is string => typeof t === "string")
      : typeof product.tags === "string"
        ? product.tags.split(",").map((t) => t.trim())
        : [];

    out.push({
      id: String(product.id ?? product.handle ?? title),
      title,
      vendor: typeof product.vendor === "string" && product.vendor ? product.vendor : domain,
      type: typeof product.product_type === "string" ? product.product_type : "",
      tags: tags.slice(0, 12),
      handle: typeof product.handle === "string" ? product.handle : "",
      price: Math.min(...prices),
      image,
    });
  }
  return { garments: out, dropped };
}

/** Just the garments. What the source itself uses. */
export function parseCatalogue(raw: unknown, domain: string): Garment[] {
  return explainCatalogue(raw, domain).garments;
}

/**
 * Where a store's catalogue lives.
 *
 * Always https, except on loopback, which is the seam the test uses to serve a
 * real-shaped payload from a local server. It is written here rather than
 * smuggled in as a magic string at the call site because it is the one place
 * this file will ever talk to something that is not a brand's website, and
 * that deserves to be visible.
 */
export function catalogueUrl(domain: string, page: number): string {
  const scheme = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(domain) ? "http" : "https";
  return `${scheme}://${domain}/products.json?limit=${PAGE_SIZE}&page=${page}`;
}

/** Fetch a store's catalogue, or nothing. Never throws: one dead brand is not a failed run. */
async function fetchCatalogue(domain: string): Promise<Garment[]> {
  const garments: Garment[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let payload: unknown;
    try {
      const res = await fetch(catalogueUrl(domain, page), {
        headers: {
          // Say who this is. A store that would rather we did not read this can
          // then block us by name instead of by guesswork.
          "User-Agent": "ClozetBot/1.0 (+https://levozlabs.com; menswear recommendations)",
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) break;
      payload = await res.json();
    } catch {
      break;
    }

    const batch = parseCatalogue(payload, domain);
    garments.push(...batch);
    // A short page is the last page.
    if (batch.length === 0) break;
    if (garments.length >= MAX_GARMENTS_PER_STORE) break;
  }
  return garments.slice(0, MAX_GARMENTS_PER_STORE);
}

/** Run tasks a few at a time, preserving order. */
async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        out[index] = await run(items[index]);
      }
    })
  );
  return out;
}

const key = (domain: string) => `shopify:catalogue:${domain}`;

/** In-process, so ten queries in one run do not each re-read the same catalogue. */
const inFlight = new Map<string, Promise<Garment[]>>();

/**
 * What this process already read, and when.
 *
 * A run issues ten searches and each one asks every store, so without this a
 * single run is ten Redis reads per brand - two hundred and seventy of them
 * across twenty-seven brands, for data that cannot have changed in the
 * seconds between. Short-lived on purpose: the authority is still Redis, this
 * only stops one run asking it the same question ten times.
 */
const MEMO_MS = 5 * 60 * 1000;
const memo = new Map<string, { at: number; garments: Garment[] }>();

async function catalogue(domain: string): Promise<Garment[]> {
  const remembered = memo.get(domain);
  if (remembered && Date.now() - remembered.at < MEMO_MS) return remembered.garments;

  if (redisConfigured()) {
    const cached = await getJson<Garment[]>(key(domain)).catch(() => null);
    if (cached?.length) {
      memo.set(domain, { at: Date.now(), garments: cached });
      return cached;
    }
  }

  const already = inFlight.get(domain);
  if (already) return already;

  const request = fetchCatalogue(domain)
    .then(async (garments) => {
      if (garments.length) {
        memo.set(domain, { at: Date.now(), garments });
        if (redisConfigured()) {
          await setJson(key(domain), garments, CATALOGUE_TTL_SECONDS).catch(() => {});
        }
      }
      return garments;
    })
    .finally(() => inFlight.delete(domain));

  inFlight.set(domain, request);
  return request;
}

/**
 * How well a garment answers a query.
 *
 * Words, not relevance ranking. The queries this app writes are a garment noun
 * plus the material, colour or cut that matters, so counting how many of those
 * words the store itself used about the product is a fair proxy - and anything
 * this lets through still has to survive the judge looking at its photograph.
 *
 * Exported for the test: the threshold is the whole behaviour.
 */
export function scoreAgainst(garment: Garment, tokens: string[]): number {
  if (!tokens.length) return 0;
  const haystack = `${garment.title} ${garment.vendor} ${garment.type} ${garment.tags.join(" ")}`.toLowerCase();
  let hits = 0;
  for (const token of tokens) if (haystack.includes(token)) hits += 1;
  return hits / tokens.length;
}

/** Words worth matching on. Two letters or fewer carries no meaning here. */
export function tokenise(query: string): string[] {
  return [...new Set(query.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/))].filter(
    (word) => word.length > 2
  );
}

/**
 * How much of a query a garment has to answer.
 *
 * Half. Lower and "olive waxed cotton field jacket" starts returning every
 * jacket in the shop; higher and it returns nothing, because no store writes
 * a title containing all five of your words.
 */
const MATCH_FLOOR = 0.5;

export async function search({
  query,
  range,
  limit = 30,
}: SourceSearchOptions): Promise<ProductListing[]> {
  const domains = stores();
  if (!domains.length) return [];

  const tokens = tokenise(query);
  const catalogues = await inBatches(domains, STORE_CONCURRENCY, (domain) =>
    catalogue(domain).catch(() => [] as Garment[])
  );

  const scored: Array<{ garment: Garment; domain: string; score: number }> = [];
  domains.forEach((domain, index) => {
    for (const garment of catalogues[index]) {
      if (garment.price < range.min || garment.price > range.max) continue;
      const score = scoreAgainst(garment, tokens);
      if (score >= MATCH_FLOOR) scored.push({ garment, domain, score });
    }
  });

  // Best match first, then cheapest, so the order is stable between runs.
  scored.sort((a, b) => b.score - a.score || a.garment.price - b.garment.price);

  return scored.slice(0, limit).map(({ garment, domain }) => ({
    id: `shopify:${domain}:${garment.id}`,
    source: "shopify" as const,
    title: garment.title,
    price: garment.price,
    currency: "USD",
    url: `${new URL(catalogueUrl(domain, 1)).origin}/products/${garment.handle}`,
    imageUrl: garment.image,
    merchant: garment.vendor,
    // New from the brand, which is exactly the difference from the other two.
    condition: "New",
    matchedQuery: query,
  }));
}

/**
 * Read every configured store now, so nobody's run pays for it.
 *
 * Twenty-seven catalogues on a cold cache is a burst of requests and tens of
 * seconds, landing on whoever happens to arrive first after a deploy or a
 * day's expiry. The sweep already warms the quiz's deck twice a day; this is
 * the same trade for the same reason.
 *
 * Never throws: a brand that has gone away is not a failed sweep.
 */
export async function warmShopifyCatalogues(): Promise<{ stores: number; garments: number }> {
  const domains = stores();
  if (!domains.length) return { stores: 0, garments: 0 };

  const catalogues = await inBatches(domains, STORE_CONCURRENCY, async (domain) => {
    // Past the cache deliberately: warming means refreshing, and a warm cache
    // would make this a no-op on the one run whose job is to replace it.
    memo.delete(domain);
    const garments = await fetchCatalogue(domain).catch(() => [] as Garment[]);
    if (garments.length) {
      memo.set(domain, { at: Date.now(), garments });
      if (redisConfigured()) await setJson(key(domain), garments, CATALOGUE_TTL_SECONDS).catch(() => {});
    }
    return garments.length;
  });

  return {
    stores: catalogues.filter((n) => n > 0).length,
    garments: catalogues.reduce((sum, n) => sum + n, 0),
  };
}
