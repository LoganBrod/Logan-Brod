// eBay Browse API — active listing search via OAuth2 client-credentials grant.
// Requires EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (from developer.ebay.com).
//
// Ported from the sports-card app in the parent repo; the OAuth token cache is
// unchanged, the search adds price/condition filtering and menswear scoping.

import type { ProductListing, SourceSearchOptions } from "./types";

const EBAY_ENV = process.env.EBAY_ENV === "sandbox" ? "sandbox" : "production";

const OAUTH_URL =
  EBAY_ENV === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

const BROWSE_BASE =
  EBAY_ENV === "sandbox"
    ? "https://api.sandbox.ebay.com/buy/browse/v1"
    : "https://api.ebay.com/buy/browse/v1";

const BASE_SCOPE = "https://api.ebay.com/oauth/api_scope";

// eBay US category IDs. 11450 is the "Clothing, Shoes & Accessories" root and is
// what we actually scope to — it is stable and safe. The menswear leaves below
// are the intended narrowing, but eBay renumbers leaf categories periodically,
// so they are NOT used until verified against the Taxonomy API
// (GET /commerce/taxonomy/v1/category_tree/0). See style/README.md.
export const EBAY_CATEGORIES = {
  clothingShoesAccessories: "11450",
  // Unverified — do not use without checking the live category tree first:
  // mensClothing: "1059",
  // mensShoes: "93427",
  // mensAccessories: "4250",
} as const;

export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getAppToken(scope: string = BASE_SCOPE): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay OAuth failed: HTTP ${res.status} ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(scope, {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  return json.access_token;
}

interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: { value?: string; currency?: string };
  shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
  itemWebUrl: string;
  image?: { imageUrl?: string };
  thumbnailImages?: Array<{ imageUrl?: string }>;
  condition?: string;
  seller?: { username?: string };
}

export async function search({
  query,
  range,
  limit = 24,
}: SourceSearchOptions): Promise<ProductListing[]> {
  const token = await getAppToken();

  // priceCurrency is mandatory whenever a price filter is present, and
  // FIXED_PRICE keeps auctions out — an auction's current bid is not a price
  // the user can actually pay.
  const filters = [
    `price:[${range.min}..${range.max}]`,
    "priceCurrency:USD",
    "buyingOptions:{FIXED_PRICE}",
  ].join(",");

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    category_ids: EBAY_CATEGORIES.clothingShoesAccessories,
    filter: filters,
    sort: "price",
  });

  const res = await fetch(`${BROWSE_BASE}/item_summary/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay Browse search failed: HTTP ${res.status} ${text}`);
  }

  const json = (await res.json()) as { itemSummaries?: EbayItemSummary[] };

  return (json.itemSummaries ?? [])
    .map((item): ProductListing => {
      const base = Number(item.price?.value ?? 0);
      const shipping = Number(item.shippingOptions?.[0]?.shippingCost?.value ?? 0);
      return {
        id: `ebay:${item.itemId}`,
        source: "ebay",
        title: item.title,
        price: Math.round((base + shipping) * 100) / 100,
        currency: item.price?.currency ?? "USD",
        url: item.itemWebUrl,
        imageUrl: item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl,
        condition: item.condition,
        merchant: item.seller?.username,
        matchedQuery: query,
      };
    })
    // Shipping can push an item past the ceiling the API filtered on.
    .filter((item) => item.price > 0 && item.price <= range.max);
}
