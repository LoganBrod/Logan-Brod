// Google Shopping via SerpAPI. Optional: with SERPAPI_KEY unset this returns
// nothing and the app runs eBay-only, which is a supported configuration.
//
// Swapping providers (Oxylabs, Rainforest, ...) means rewriting `toListing` and
// the request URL here; nothing outside this file knows SerpAPI exists.

import type { ProductListing, SourceSearchOptions } from "./types";

const ENDPOINT = "https://serpapi.com/search.json";

export function serpapiConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

interface SerpShoppingResult {
  position?: number;
  title?: string;
  product_id?: string;
  product_link?: string;
  link?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  thumbnail?: string;
}

function toListing(
  raw: SerpShoppingResult,
  query: string,
  index: number
): ProductListing | null {
  const url = raw.product_link || raw.link;
  const price = raw.extracted_price;
  if (!raw.title || !url || typeof price !== "number" || price <= 0) return null;

  return {
    id: `serpapi:${raw.product_id ?? `${index}-${url.slice(-24)}`}`,
    source: "serpapi",
    title: raw.title,
    price,
    currency: "USD",
    url,
    imageUrl: raw.thumbnail,
    merchant: raw.source,
    condition: "New",
    matchedQuery: query,
  };
}

export async function search({
  query,
  range,
  limit = 24,
}: SourceSearchOptions): Promise<ProductListing[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    api_key: apiKey,
    gl: "us",
    hl: "en",
    num: String(Math.min(limit, 60)),
    // Google's own price-range filter, so we page through fewer junk results.
    tbs: `mr:1,price:1,ppr_min:${range.min},ppr_max:${range.max}`,
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SerpAPI search failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    error?: string;
    shopping_results?: SerpShoppingResult[];
  };

  // SerpAPI reports quota and query errors in a 200 body.
  if (json.error) throw new Error(`SerpAPI: ${json.error}`);

  return (json.shopping_results ?? [])
    .map((raw, i) => toListing(raw, query, i))
    .filter((item): item is ProductListing => item !== null)
    .filter((item) => item.price >= range.min && item.price <= range.max);
}
