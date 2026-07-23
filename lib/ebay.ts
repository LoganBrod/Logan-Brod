// eBay Browse API client — active listing search via OAuth2 client-credentials grant.
// Requires EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (from developer.ebay.com) in the environment.

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
  tokenCache.set(scope, { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

export interface EbayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  shipping: number | null;
  url: string;
  imageUrl?: string;
  condition?: string;
  seller?: string;
  buyingOptions: string[];
}

interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: { value?: string; currency?: string };
  shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
  itemWebUrl: string;
  image?: { imageUrl?: string };
  condition?: string;
  seller?: { username?: string };
  buyingOptions?: string[];
}

export async function searchActiveListings(
  query: string,
  opts: { limit?: number; categoryId?: string } = {}
): Promise<EbayListing[]> {
  const token = await getAppToken();
  const limit = opts.limit ?? 50;

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  if (opts.categoryId) params.set("category_ids", opts.categoryId);

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
  const items = json.itemSummaries ?? [];

  return items.map((item): EbayListing => ({
    itemId: item.itemId,
    title: item.title,
    price: Number(item.price?.value ?? 0),
    currency: item.price?.currency ?? "USD",
    shipping:
      item.shippingOptions?.[0]?.shippingCost?.value != null
        ? Number(item.shippingOptions[0].shippingCost!.value)
        : null,
    url: item.itemWebUrl,
    imageUrl: item.image?.imageUrl,
    condition: item.condition,
    seller: item.seller?.username,
    buyingOptions: item.buyingOptions ?? [],
  }));
}
