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
  return url.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)/i, `/s-l${MODEL_EDGE}.$1`);
}

/**
 * The long edge every candidate photo is asked for before a model sees it.
 *
 * 225 because that is what eBay's own thumbnail rendition is, and because the
 * wearer's uploads reach the same call at 256. A candidate does not need to be
 * read more closely than the thing it is being matched against.
 *
 * This is the single biggest number in the cost of a run. Claude bills an
 * image at roughly (w x h) / 750 tokens, so 225px is 68 tokens and 1400px is
 * 2,613 - and ninety-six candidates are judged every generation. Shopify
 * serves its catalogue images at full size, which made the brands' third of
 * the pool cost more than the other two thirds put together.
 */
export const MODEL_EDGE = 225;

/**
 * The same photo, asked for small, whoever is serving it.
 *
 * Applied on the way into the model and nowhere else. The rail on screen
 * still renders `imageUrl`, so nothing a person looks at gets smaller - which
 * is the distinction the eBay rewrite above gets wrong and is left alone
 * because changing it is a visible change rather than a cost one.
 *
 * Unknown hosts are returned untouched. Guessing at a resize parameter that a
 * CDN does not implement is how you get a 404 instead of a garment.
 */
export function modelRendition(url: string | undefined): string | undefined {
  if (!url) return undefined;

  // eBay names the size in the path.
  if (/\/s-l\d+\.(jpg|jpeg|png|webp)/i.test(url)) return thumbnailUrl(url);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  // Shopify's image CDN takes width as a query parameter and honours it on
  // every store, including the ones on their own domain.
  if (/(^|\.)shopify\.com$/i.test(parsed.hostname) || /cdn\.shopify/i.test(parsed.hostname)) {
    parsed.searchParams.set("width", String(MODEL_EDGE));
    return parsed.toString();
  }

  return url;
}
