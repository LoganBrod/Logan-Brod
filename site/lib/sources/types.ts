// The one normalized shape every shopping source emits. Adding a source means
// writing a module that exports `search()` returning these — nothing downstream
// (curation, outfits, UI) should ever branch on which source an item came from,
// except to render the `source` badge.

export type SourceName = "ebay" | "serpapi" | "shopify";

export interface ProductListing {
  /** Stable within a run; prefixed with the source so IDs can't collide. */
  id: string;
  source: SourceName;
  title: string;
  /** Total in `currency`, shipping included where the source reports it. */
  price: number;
  currency: string;
  url: string;
  imageUrl?: string;
  merchant?: string;
  condition?: string;
  /** The generated query that surfaced this item, for debugging bad results. */
  matchedQuery?: string;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface SourceSearchOptions {
  query: string;
  range: PriceRange;
  limit?: number;
  /** Secondhand, new, or both. Only eBay carries both, so only eBay reads it. */
  market?: import("../market").Market;
}

/** What ran, what it returned, and why it returned nothing. */
export interface SourceReport {
  source: SourceName;
  /**
   * Whether this run had any use for the source.
   *
   * A secondhand run does not ask a brand's own shop. Without this the report
   * for one reads exactly like a source that ran and came back empty, and the
   * closet page tells somebody the shops found nothing when nobody asked them.
   */
  asked?: boolean;
  configured: boolean;
  ok: boolean;
  count: number;
  error?: string;
}

export interface ShopResult {
  listings: ProductListing[];
  reports: SourceReport[];
}
