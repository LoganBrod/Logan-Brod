// eBay Browse API — active listing search.
//
// Search quality is the whole game here: everything downstream can only pick
// from what this returns, so the filters below matter more than any prompt.

import { BROWSE_BASE, getAppToken } from "./ebayAuth";
import { menswearCategoryIds } from "./ebayCategories";
import { rejectTitle, thumbnailUrl } from "./menswear";
import type { ProductListing, SourceSearchOptions } from "./types";

export { ebayConfigured, getAppToken } from "./ebayAuth";

interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: { value?: string; currency?: string };
  shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
  itemWebUrl: string;
  image?: { imageUrl?: string };
  thumbnailImages?: Array<{ imageUrl?: string }>;
  condition?: string;
  conditionId?: string;
  seller?: { username?: string; feedbackPercentage?: string };
}

/**
 * Everything except "For parts or not working" (7000) and the manufacturer-
 * refurbished tiers we can't judge. Used and vintage stock is most of what
 * makes eBay worth searching, so it stays in.
 */
const CONDITION_IDS = ["1000", "1500", "1750", "2000", "2500", "3000", "4000", "5000"];

export async function search({
  query,
  range,
  limit = 30,
}: SourceSearchOptions): Promise<ProductListing[]> {
  const [token, categoryIds] = await Promise.all([getAppToken(), menswearCategoryIds()]);

  // priceCurrency is mandatory alongside a price filter. FIXED_PRICE keeps
  // auctions out — a current bid isn't a price anyone can actually pay.
  const filters = [
    `price:[${range.min}..${range.max}]`,
    "priceCurrency:USD",
    "buyingOptions:{FIXED_PRICE}",
    `conditionIds:{${CONDITION_IDS.join("|")}}`,
  ].join(",");

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    category_ids: categoryIds.join(","),
    filter: filters,
  });

  // Deliberately no `sort`. eBay's default is Best Match relevance; sorting by
  // price ascending returns the cheapest things matching the words — insoles,
  // size charts, replicas — which is exactly the junk we were drowning in.

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
    // Category scoping catches most of it, but sellers miscategorise constantly.
    .filter((item) => item.title && !rejectTitle(item.title))
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
        imageUrl: thumbnailUrl(item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl),
        condition: item.condition,
        merchant: item.seller?.username,
        matchedQuery: query,
      };
    })
    // Shipping can push an item past the ceiling the API filtered on, and an
    // item with no photo can't be judged by the curation pass.
    .filter((item) => item.price > 0 && item.price <= range.max && Boolean(item.imageUrl));
}
