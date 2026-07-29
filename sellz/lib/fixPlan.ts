import type { Listing, ScoreDimension } from "./store";

/** What kind of repair a weak listing needs. */
export type FixKind = "photos" | "content" | "price";

const PHOTO_DIMENSIONS = new Set<ScoreDimension["dimension"]>(["photo_coverage"]);
const PRICE_DIMENSIONS = new Set<ScoreDimension["dimension"]>(["price_vs_comps"]);
/** Everything else is text the Brain can rewrite: title, category, specifics. */

const LABEL: Record<string, string> = {
  photo_coverage: "the photos",
  price_vs_comps: "the price against comparable sales",
  title_keywords: "the title keywords",
  item_specifics: "the item specifics",
  description_trust: "the description",
  condition_clarity: "how the condition is described",
  category_fit: "the category",
};

/**
 * Decide which weakness is actually holding a listing back.
 *
 * Prefers the score breakdown, which names the failing dimension outright.
 * Older scores predate the breakdown, so fall back to reading the reason
 * text — imprecise, but better than offering a photo upload to a listing
 * whose problem is its price.
 */
export function planFor(listing: Listing): { kind: FixKind; weakest: string; detail: string } {
  const breakdown = listing.brainScore?.breakdown ?? [];
  if (breakdown.length) {
    const worst = [...breakdown].sort((a, b) => a.score - b.score)[0];
    const kind: FixKind = PHOTO_DIMENSIONS.has(worst.dimension)
      ? "photos"
      : PRICE_DIMENSIONS.has(worst.dimension)
        ? "price"
        : "content";
    return {
      kind,
      weakest: LABEL[worst.dimension] ?? worst.dimension,
      detail: worst.detail,
    };
  }

  const reason = (listing.brainScore?.reason ?? "").toLowerCase();
  const noPhotos = (listing.photos?.length ?? 0) + (listing.imageUrls?.length ?? 0) === 0;
  if (noPhotos || /photo|image|picture|shot/.test(reason)) {
    return {
      kind: "photos",
      weakest: LABEL.photo_coverage,
      detail: listing.brainScore?.reason ?? "This listing needs clear photos.",
    };
  }
  if (/price|overprice|comps|expensive/.test(reason)) {
    return {
      kind: "price",
      weakest: LABEL.price_vs_comps,
      detail: listing.brainScore?.reason ?? "",
    };
  }
  return {
    kind: "content",
    weakest: LABEL.title_keywords,
    detail: listing.brainScore?.reason ?? "",
  };
}

