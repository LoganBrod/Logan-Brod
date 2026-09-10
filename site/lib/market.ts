// Secondhand, new, or both.
//
// This started as a secondhand tool, and the premise carried real weight: the
// right jacket in your size at your price is listed on a Tuesday and gone by
// Wednesday, which is a genuine problem worth solving. But it also meant every
// result came from a marketplace, and a marketplace is not a brand. Plenty of
// people would rather buy the thing new from the people who make it, and
// plenty of others want both and will decide per piece.
//
// So it is a choice rather than a premise, and it is one setting with three
// positions rather than a pile of source toggles nobody would understand.
//
// Two things it controls, because they are the same question asked twice:
// which sources are worth running, and which conditions eBay is allowed to
// return. eBay is the only source that carries both - Google Shopping and a
// brand's own shop are new by definition - so leaving its condition filter
// alone would make "new" mean "new, plus whatever eBay felt like".

import type { SourceName } from "./sources/types";

export const MARKETS = [
  {
    value: "secondhand",
    label: "Secondhand",
    hint: "Worn, vintage, already out there.",
  },
  {
    value: "mix",
    label: "Both",
    hint: "Whatever suits, new or not.",
  },
  {
    value: "new",
    label: "New",
    hint: "Bought from the brand.",
  },
] as const;

export type Market = (typeof MARKETS)[number]["value"];

/**
 * Both, unless somebody says otherwise.
 *
 * The old default was secondhand-only by construction, and it was never a
 * decision anybody made - it was the only source there was.
 */
export const DEFAULT_MARKET: Market = "mix";

export function isMarket(raw: unknown): raw is Market {
  return MARKETS.some((m) => m.value === raw);
}

export function asMarket(raw: unknown): Market {
  return isMarket(raw) ? raw : DEFAULT_MARKET;
}

/**
 * Which sources are worth asking.
 *
 * eBay is in every mode because it is the only one that carries both; the
 * condition filter below is what makes it mean the right thing. Google
 * Shopping and the brands' own shops sell new stock, so they sit out a
 * secondhand run rather than returning things it would have to discard.
 */
export function sourcesFor(market: Market): SourceName[] {
  switch (market) {
    case "secondhand":
      return ["ebay"];
    case "new":
      return ["serpapi", "shopify", "ebay"];
    default:
      return ["ebay", "serpapi", "shopify"];
  }
}

/*
 * eBay's condition ids.
 *
 * 1000 new, 1500 new other, 1750 new with defects, 2000-2500 the refurbished
 * tiers, 3000-5000 used and its grades. 7000 is "for parts", which is never
 * wanted.
 *
 * Refurbished sits with secondhand rather than new: it has been owned, and
 * somebody who asked for new means from the brand, in the box.
 */
const NEW_IDS = ["1000", "1500", "1750"];
const USED_IDS = ["2000", "2500", "3000", "4000", "5000"];

export function conditionIdsFor(market: Market): string[] {
  switch (market) {
    case "secondhand":
      return USED_IDS;
    case "new":
      return NEW_IDS;
    default:
      return [...NEW_IDS, ...USED_IDS];
  }
}
