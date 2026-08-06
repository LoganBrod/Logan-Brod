/**
 * What each marketplace rewards, in one place.
 *
 * None of the platforms a 16-24 year old actually sells on publishes a listing
 * API. eBay does, and it is already wired up. Depop, Vinted and Grailed do not
 * — Vinted's "Pro Integrations" API exists but is for business accounts, not
 * someone flipping thrift finds. Every cross-listing tool on the market works
 * around this the same way, by driving the seller's own logged-in browser.
 *
 * So the structure is fixed: write copy the platform's algorithm actually
 * rewards, hand it over to paste, then track the outcome by asking. What is
 * NOT fixed is writing that per platform. The differences between these sites
 * are a handful of parameters — whether a title field exists, how many tags
 * are allowed, what makes a listing go stale — so they live here as data, and
 * one generator reads them. Adding a fourth marketplace is a spec, not a
 * feature.
 *
 * Ranking behaviour below is drawn from public seller documentation and
 * community guidance current to 2026. It is observed behaviour, not published
 * spec, and these platforms change it without announcement — treat it as the
 * best available reading rather than fact, and revisit when results drift.
 */

export type MarketplaceId = "depop" | "vinted" | "grailed";

export interface MarketplaceSpec {
  id: MarketplaceId;
  name: string;
  /** Who is buying, in a sentence, to steer tone. */
  audience: string;
  /** What actually ranks a listing. Goes into the prompt verbatim. */
  algorithm: string;
  /** Platform-specific writing rules. Goes into the prompt verbatim. */
  rules: string;
  /** Does this platform have a title field distinct from the description? */
  hasTitle: boolean;
  titleLimit: number;
  descriptionLimit: number;
  /** 0 when the platform has no tag field. */
  hashtagLimit: number;
  /** The condition picker's real options. */
  conditions: readonly string[];
  /** Grailed buyers shop by measurement, not size label. */
  requiresMeasurements: boolean;
  /** Days before the listing has sunk far enough to be worth acting on. */
  refreshAfterDays: number;
  /** What the platform calls the action that restores freshness. */
  refreshVerb: string;
  /** Why that action works, shown to the seller. */
  refreshNote: string;
  /** When this audience browses. */
  postWindows: string[];
  /** Seller fee, as a percentage, for the price guidance. */
  feePct: number;
}

const DEPOP: MarketplaceSpec = {
  id: "depop",
  name: "Depop",
  audience: "16-24, fashion-led, browsing a visual feed rather than searching",
  algorithm:
    "Depop ranks on recency and engagement, not keyword match. Likes and saves in the first hours decide how far a listing travels. Hashtags are the search index and are capped at 5. Photos outrank everything: the feed is visual and the first photo does most of the work.",
  rules: `- THERE IS NO TITLE FIELD. The first line of the description is the closest thing, so it should read like a person naming the item to a friend — "carhartt detroit jacket / large" — never a keyword string.
- Spend the 5 hashtags well: one brand, one garment type, two or three aesthetic tags people actually browse (#y2k #grunge #streetwear #workwear).
- Write short, lower case, conversational. Aesthetic and styling language beats specification. No ALL CAPS, no bullet lists of specs.
- Recommend modelled shots and flat-lays in natural light, not eBay's white-background catalogue shot.`,
  hasTitle: false,
  titleLimit: 0,
  descriptionLimit: 1000,
  hashtagLimit: 5,
  conditions: ["Brand new", "Like new", "Excellent", "Good", "Fair"],
  requiresMeasurements: false,
  refreshAfterDays: 7,
  refreshVerb: "refresh",
  refreshNote:
    "Depop pushes recent listings first, so this one has drifted down the feed. Refreshing it puts it back near the top.",
  postWindows: ["12pm – 2pm", "5pm – 7pm", "8pm – 10pm"],
  feePct: 10,
};

const VINTED: MarketplaceSpec = {
  id: "vinted",
  name: "Vinted",
  audience:
    "16-24, price-sensitive, searching for specific brands and sizes. No seller fees, so buyers expect keen prices",
  algorithm:
    "Freshness is the dominant lever: roughly 70% of a listing's total views arrive in its first 24 hours, and after a week it gets almost none. Ranking also weighs keyword relevance in the title, listing completeness — every empty field is a negative signal — click-through on the main photo, seller rating, and early engagement.",
  rules: `- Vinted HAS a title field and it is keyword-matched, so put brand, item type, size and colour in it. This is closer to eBay than to Depop — do not write a vibe line here.
- COMPLETENESS IS A RANKING FACTOR. Fill every field you can: brand, category, subcategory, size, colour, condition. An empty field costs visibility directly.
- The description is plain and practical: fit, material, flaws, measurements if useful. Buyers here are comparing several similar items on price and condition.
- Price competitively — the working benchmark is around 85% of what comparable items ask. Vinted charges sellers nothing, so a keen price costs less here than on any other platform.
- Recommend at least 3 photos, ideally 5-8, on a plain background in daylight.`,
  hasTitle: true,
  titleLimit: 80,
  descriptionLimit: 1200,
  hashtagLimit: 0,
  conditions: [
    "Brand new with tags",
    "Brand new without tags",
    "Very good",
    "Good",
    "Satisfactory",
  ],
  requiresMeasurements: false,
  refreshAfterDays: 4,
  refreshVerb: "relist",
  refreshNote:
    "About 70% of a Vinted listing's views land in the first day, and after a week it is close to invisible. Changing three or more things — photo, title, price, description — reads as an active listing and lifts it again.",
  postWindows: ["7pm – 10pm"],
  feePct: 0,
};

const GRAILED: MarketplaceSpec = {
  id: "grailed",
  name: "Grailed",
  audience:
    "16-30, menswear and streetwear, knowledgeable about brands and archive pieces, shops by measurement",
  algorithm:
    "Grailed's search favours fresh listings, and buyers rarely go past the first few pages, so an ageing listing is effectively invisible. Bumps restore freshness — once every 7 days for the first 30 days, after which a bump requires dropping the price by at least 10%. Small price drops also trigger visibility.",
  rules: `- Grailed HAS a title field and it is what search matches. Front-load it: brand, sub-label, season or year, item name, colourway, size.
- MEASUREMENTS ARE NOT OPTIONAL. Grailed buyers shop by measurement, not size tag, and a listing without them gets skipped. Give pit-to-pit, length, shoulder and sleeve. If the source listing does not have them, say plainly which ones the seller still needs to measure — do not invent numbers.
- This audience knows the brands. Name the sub-label, the era, the collaboration if there is one. Vagueness reads as someone who does not know what they have, and gets lowballed.
- Tone is factual and knowledgeable, not salesy and not aesthetic-led. No hype adjectives.
- Flaws stated precisely, with location. This audience inspects.`,
  hasTitle: true,
  titleLimit: 60,
  descriptionLimit: 1500,
  hashtagLimit: 0,
  conditions: ["New", "Gently used", "Used", "Very worn"],
  requiresMeasurements: true,
  refreshAfterDays: 7,
  refreshVerb: "bump",
  refreshNote:
    "Grailed buyers rarely scroll past the first pages, so an ageing listing stops being seen. A bump restores it — allowed once a week for the first 30 days, after which it needs a 10% price drop.",
  postWindows: ["6pm – 9pm"],
  feePct: 9,
};

export const MARKETPLACES: Record<MarketplaceId, MarketplaceSpec> = {
  depop: DEPOP,
  vinted: VINTED,
  grailed: GRAILED,
};

export const MARKETPLACE_IDS = Object.keys(MARKETPLACES) as MarketplaceId[];

export function isMarketplaceId(v: unknown): v is MarketplaceId {
  return typeof v === "string" && v in MARKETPLACES;
}

/**
 * Why none of these can publish for the seller.
 *
 * Kept as copy rather than left to each screen to phrase, because a vague
 * "coming soon" would imply the button is arriving. It is not: there is no
 * API to build it on, and driving someone's logged-in browser is how the
 * cross-listing tools do it, which is a different product with a different
 * risk profile.
 */
export const NO_API_NOTE =
  "None of these let apps post on your behalf — there's no public API for sellers. So this writes the listing the way each site's algorithm actually wants it, and you paste it in.";
