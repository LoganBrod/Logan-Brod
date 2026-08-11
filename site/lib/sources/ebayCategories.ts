// Resolve eBay's menswear category IDs at runtime instead of hardcoding them.
//
// Hardcoding is the obvious approach and it's a trap: eBay renumbers leaf
// categories, and a stale ID doesn't error — the search just returns nothing,
// silently, forever. Resolving from the live tree can't go stale, and if the
// lookup fails we fall back to the whole Clothing/Shoes/Accessories root, which
// is broad but never wrong.

import { getAppToken } from "./ebayAuth";

const TAXONOMY_BASE = "https://api.ebay.com/commerce/taxonomy/v1";

/** Clothing, Shoes & Accessories. Stable, and the fallback if resolution fails. */
export const CLOTHING_ROOT = "11450";

interface CategoryNode {
  category: { categoryId: string; categoryName: string };
  childCategoryTreeNodes?: CategoryNode[];
}

let cached: Promise<string[]> | null = null;

/**
 * The men's branches directly under Clothing, Shoes & Accessories — typically
 * "Men" or the older "Men's Clothing" / "Men's Shoes" / "Men's Accessories",
 * depending on how eBay has the tree arranged that week. Matching on name
 * rather than ID is what makes this survive their reshuffles.
 */
async function resolve(): Promise<string[]> {
  const token = await getAppToken();

  const res = await fetch(
    `${TAXONOMY_BASE}/category_tree/0/get_category_subtree?category_id=${CLOTHING_ROOT}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        Accept: "application/json",
      },
      // The tree changes rarely; let the platform cache it for a day.
      next: { revalidate: 86_400 },
      // The subtree is a large document and this sits on the critical path of
      // every search. Better to fall back to broad categories than to hang.
      signal: AbortSignal.timeout(6_000),
    }
  );

  if (!res.ok) {
    throw new Error(`eBay taxonomy lookup failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { categorySubtreeNode?: CategoryNode };
  const children = json.categorySubtreeNode?.childCategoryTreeNodes ?? [];

  const mens = children
    .filter((node) => /^men('s)?\b/i.test(node.category.categoryName.trim()))
    .map((node) => node.category.categoryId);

  if (!mens.length) {
    throw new Error("No men's branch found under Clothing, Shoes & Accessories");
  }

  return mens;
}

/**
 * Menswear category IDs, or the broad clothing root if they can't be resolved.
 * Never throws — a taxonomy outage should narrow quality, not break search.
 */
export async function menswearCategoryIds(): Promise<string[]> {
  if (!cached) {
    cached = resolve().catch((err) => {
      console.warn(
        `[ebay] falling back to the full clothing category: ${err instanceof Error ? err.message : err}`
      );
      // Clear so a later request can retry rather than caching the failure.
      cached = null;
      return [CLOTHING_ROOT];
    });
  }
  return cached;
}
