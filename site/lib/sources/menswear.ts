// Menswear enforcement, applied to every source.
//
// Search engines happily return womenswear, kids' sizes, and listing chaff for
// a query like "brown suede chelsea boot". Category scoping handles most of it
// on eBay, but it can't be relied on alone — sellers miscategorise constantly,
// and the second source has no category concept at all. So titles get a second
// pass here.

/**
 * Terms that mean the listing isn't a wearable men's garment. Matched on word
 * boundaries so "mens" doesn't trip on "womens" and "boy" doesn't trip on
 * "boyfriend" or "cowboy".
 */
const NOT_MENSWEAR = [
  "women",
  "womens",
  "women's",
  "woman",
  "ladies",
  "lady",
  "girls",
  "girl's",
  "juniors",
  "misses",
  "maternity",
  "boys",
  "boy's",
  "toddler",
  "infant",
  "baby",
  "kids",
  "children",
  "childrens",
];

/**
 * Listings that aren't a single buyable garment. These are the things that make
 * a cheap-first search look like a junk drawer.
 */
const NOT_A_GARMENT = [
  "lot of",
  "bulk",
  "wholesale",
  "reseller",
  "bundle of",
  "size chart",
  "for parts",
  "not working",
  "damaged",
  "as is",
  "replica",
  "fake",
  "inspired by",
  "sewing pattern",
  "pattern only",
  "digital download",
  "poster",
  "sticker",
  "keychain",
  "gift card",
  "empty box",
  "box only",
  "tags only",
  "display only",
];

function hasTerm(haystack: string, term: string): boolean {
  // Word-boundary match, with the term's own punctuation escaped.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(haystack);
}

export interface Rejection {
  reason: "not-menswear" | "not-a-garment";
  term: string;
}

/** Returns why a title should be dropped, or null to keep it. */
export function rejectTitle(title: string): Rejection | null {
  const normalized = title.toLowerCase();

  // "men's" and "unisex" are strong enough signals to override a stray token
  // like "ladies" in a brand or a comparison ("fits like ladies 8").
  const declaredMens = /\bmen'?s\b|\bmens\b|\bunisex\b/i.test(normalized);

  if (!declaredMens) {
    for (const term of NOT_MENSWEAR) {
      if (hasTerm(normalized, term)) return { reason: "not-menswear", term };
    }
  }

  for (const term of NOT_A_GARMENT) {
    if (hasTerm(normalized, term)) return { reason: "not-a-garment", term };
  }

  return null;
}

export function isMenswearListing(title: string): boolean {
  return rejectTitle(title) === null;
}

/**
 * eBay serves several renditions per image; the API often hands back a large
 * one. Curation only needs enough pixels to tell what the garment is, and image
 * tokens scale with area — so ask for the small rendition.
 *
 * 225 rather than 400. Sixteen of these go into every curation batch and six
 * batches go into every run, which made them two thirds of everything curation
 * reads — the single largest line in the bill. Area is quadratic, so the step
 * down costs about a third as many tokens.
 *
 * The argument that it is enough: the wearer's own uploads are sent to this
 * same call at 256px on the long edge, on the grounds that a photograph that
 * small is still plainly a green waxed jacket. A candidate does not need to be
 * read more closely than the thing it is being matched against.
 *
 * Only the model sees this rendition. The closet renders from the listing's
 * original `imageUrl`, so nothing on screen gets smaller.
 */
export function thumbnailUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)/i, "/s-l225.$1");
}
