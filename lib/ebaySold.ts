// eBay Marketplace Insights API — 90-day sold-item comps.
// NOTE: this API requires eBay to grant your application special "buy.marketplace.insights"
// access (limited release, applied for separately from the standard Browse API). If your
// app isn't entitled, calls fail with 403 and this module degrades gracefully to null so
// PriceCharting can be used as the comp source instead.

import { getAppToken } from "./ebay";

const INSIGHTS_BASE = "https://api.ebay.com/buy/marketplace_insights/v1_beta";
const INSIGHTS_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights";

export interface EbaySoldComp {
  averagePrice: number;
  sampleSize: number;
  source: "ebay-sold";
}

interface ItemSale {
  lastSoldPrice?: { value?: string };
  price?: { value?: string };
}

export async function getEbaySoldComp(
  query: string,
  opts: { limit?: number; categoryId?: string } = {}
): Promise<EbaySoldComp | null> {
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) return null;

  let token: string;
  try {
    token = await getAppToken(INSIGHTS_SCOPE);
  } catch {
    return null;
  }

  const params = new URLSearchParams({ q: query, limit: String(opts.limit ?? 20) });
  if (opts.categoryId) params.set("category_ids", opts.categoryId);

  let res: Response;
  try {
    res = await fetch(`${INSIGHTS_BASE}/item_sales/search?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as { itemSales?: ItemSale[] } | null;
  const sales = json?.itemSales ?? [];
  if (sales.length === 0) return null;

  const prices = sales
    .map((s) => Number(s.lastSoldPrice?.value ?? s.price?.value ?? NaN))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (prices.length === 0) return null;

  const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  return { averagePrice, sampleSize: prices.length, source: "ebay-sold" };
}
