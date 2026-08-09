// What fits, and what to do with a listing that says otherwise.
//
// This is the one thing about a person the app can't learn from behaviour: no
// amount of watching someone browse tells you their inseam. So it's asked once
// and remembered, and it does more work than any other single input — a jacket
// that's perfect and two sizes wrong is worth nothing.
//
// The filtering posture here is deliberately timid. A listing is only dropped
// when its title *states* a size that can't fit; a title that says nothing about
// size stays in, because plenty of good listings put the size in the item
// specifics and never in the title. Dropping a wearable piece is a worse error
// than passing an unwearable one through, since the curation pass reads the
// title too and gets a second chance to catch it.

/** Everything optional — someone who fills in only a shoe size still gets the benefit. */
export interface Sizes {
  /** Letter size for tops and outerwear: XS through 3XL. */
  tops?: string;
  /** Jacket chest measurement in inches, with an optional length letter: "42R". */
  jacket?: string;
  /** Trouser waist, inches. */
  waist?: number;
  /** Trouser inseam, inches. */
  inseam?: number;
  /** US shoe size, whole or half. */
  shoe?: number;
}

export const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;

/** Written the way listings write them, mapped onto the canonical list. */
const LETTER_ALIASES: Record<string, string> = {
  XS: "XS",
  "X-SMALL": "XS",
  XSMALL: "XS",
  S: "S",
  SMALL: "S",
  M: "M",
  MEDIUM: "M",
  L: "L",
  LARGE: "L",
  XL: "XL",
  "X-LARGE": "XL",
  XLARGE: "XL",
  XXL: "2XL",
  "2XL": "2XL",
  "XX-LARGE": "2XL",
  XXXL: "3XL",
  "3XL": "3XL",
};

export function normalizeLetter(input: string | undefined): string | null {
  if (!input) return null;
  const key = input.trim().toUpperCase().replace(/\s+/g, "");
  return LETTER_ALIASES[key] ?? null;
}

/** How far apart two letter sizes are, or null if either isn't a letter size. */
function letterDistance(a: string, b: string): number | null {
  const ia = LETTER_SIZES.indexOf(a as (typeof LETTER_SIZES)[number]);
  const ib = LETTER_SIZES.indexOf(b as (typeof LETTER_SIZES)[number]);
  if (ia < 0 || ib < 0) return null;
  return Math.abs(ia - ib);
}

export interface TitleSizes {
  letter?: string;
  /** Waist and inseam, from a "34x32" measurement. */
  waist?: number;
  inseam?: number;
  /** Chest measurement from a "42R"-style jacket size. */
  chest?: number;
  shoe?: number;
}

/**
 * Pull sizes out of a listing title.
 *
 * Every pattern here demands a strong signal. A bare "L" or a stray two-digit
 * number appears in half the titles on eBay — model numbers, years, pack counts,
 * measurements of something else — so a letter size has to either follow the
 * word "size" or stand alone in upper case, and numbers have to arrive in a
 * shape that only ever means a size.
 */
export function sizesInTitle(title: string): TitleSizes {
  const found: TitleSizes = {};

  // "Size L", "size: XL", "sz M".
  const labelled = title.match(/\b(?:size|sz)\.?\s*:?\s*([A-Za-z-]{1,7})\b/i);
  const fromLabel = normalizeLetter(labelled?.[1]);
  if (fromLabel) found.letter = fromLabel;

  // A standalone upper-case token. Case matters: "Large" in a sentence is prose,
  // "LARGE" or " L " between other words is a size.
  if (!found.letter) {
    const standalone = title.match(/(?:^|[\s(\[/,-])(XS|S|M|L|XL|XXL|2XL|XXXL|3XL)(?=$|[\s)\]/,.-])/);
    const fromToken = normalizeLetter(standalone?.[1]);
    if (fromToken) found.letter = fromToken;
  }

  // Denim measurements: "34x32", "34 X 32", "W34 L32".
  const measured =
    title.match(/\b(\d{2})\s*[xX×]\s*(\d{2})\b/) ??
    title.match(/\bW\s?(\d{2})\s*[/\s-]?\s*L\s?(\d{2})\b/i);
  if (measured) {
    const waist = Number(measured[1]);
    const inseam = Number(measured[2]);
    if (waist >= 26 && waist <= 50 && inseam >= 26 && inseam <= 40) {
      found.waist = waist;
      found.inseam = inseam;
    }
  }

  // A waist on its own: "W34", "34W".
  if (found.waist === undefined) {
    const waistOnly = title.match(/\bW\s?(\d{2})\b/i) ?? title.match(/\b(\d{2})\s?W\b/i);
    const waist = Number(waistOnly?.[1]);
    if (waist >= 26 && waist <= 50) found.waist = waist;
  }

  // Jacket sizes carry a length letter — "42R", "40 Short" — which is what
  // separates them from every other two-digit number in a title.
  const chest = title.match(/\b(3[4-9]|4[0-8]|5[0-2])\s*(R|S|L|REG|SHORT|LONG)\b/i);
  if (chest) found.chest = Number(chest[1]);

  // Shoes have to say so. "10.5D", "US 10", "Size 10 M" — a bare "10" doesn't count.
  const shoe =
    title.match(/\bUS\s?(\d{1,2}(?:\.5)?)\b/i) ??
    title.match(/\b(\d{1,2}(?:\.5)?)\s?(?:D|EE|EEE|M|B)\b(?!\w)/);
  const shoeSize = Number(shoe?.[1]);
  if (shoeSize >= 5 && shoeSize <= 16) found.shoe = shoeSize;

  return found;
}

/**
 * True when the title states a size this person can't wear.
 *
 * Tolerances are generous on purpose: one letter size either way is often still
 * wearable depending on cut, an inseam can be taken up, and vanity sizing makes
 * a stated waist approximate. Only a clear miss counts.
 */
export function conflictsWithSizes(title: string, sizes: Sizes): boolean {
  const stated = sizesInTitle(title);

  const wanted = normalizeLetter(sizes.tops);
  if (stated.letter && wanted) {
    const distance = letterDistance(stated.letter, wanted);
    if (distance !== null && distance > 1) return true;
  }

  if (stated.waist !== undefined && sizes.waist) {
    if (Math.abs(stated.waist - sizes.waist) > 2) return true;
  }

  // Inseam only counts alongside a waist — a listing that mentions one length
  // and nothing else is usually measuring something other than a leg.
  if (stated.inseam !== undefined && sizes.inseam && stated.waist !== undefined) {
    if (stated.inseam - sizes.inseam < -2) return true;
  }

  if (stated.chest !== undefined && sizes.jacket) {
    const wantedChest = Number(sizes.jacket.match(/\d{2}/)?.[0]);
    if (Number.isFinite(wantedChest) && Math.abs(stated.chest - wantedChest) > 2) return true;
  }

  if (stated.shoe !== undefined && sizes.shoe) {
    if (Math.abs(stated.shoe - sizes.shoe) > 0.5) return true;
  }

  return false;
}

/** Whether anything was filled in at all. */
export function hasSizes(sizes: Sizes | null | undefined): sizes is Sizes {
  if (!sizes) return false;
  return Boolean(sizes.tops || sizes.jacket || sizes.waist || sizes.inseam || sizes.shoe);
}

/** Accept only what we'd have written ourselves — this goes into a prompt. */
export function cleanSizes(input: unknown): Sizes {
  const raw = (input ?? {}) as Record<string, unknown>;
  const sizes: Sizes = {};

  const tops = normalizeLetter(typeof raw.tops === "string" ? raw.tops : undefined);
  if (tops) sizes.tops = tops;

  if (typeof raw.jacket === "string") {
    const jacket = raw.jacket.trim().toUpperCase();
    if (/^(3[4-9]|4[0-8]|5[0-2])\s?(R|S|L)?$/.test(jacket)) sizes.jacket = jacket.replace(/\s/g, "");
  }

  const number = (value: unknown, lo: number, hi: number, half = false): number | undefined => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < lo || n > hi) return undefined;
    return half ? Math.round(n * 2) / 2 : Math.round(n);
  };

  const waist = number(raw.waist, 26, 50);
  if (waist) sizes.waist = waist;
  const inseam = number(raw.inseam, 26, 40);
  if (inseam) sizes.inseam = inseam;
  const shoe = number(raw.shoe, 5, 16, true);
  if (shoe) sizes.shoe = shoe;

  return sizes;
}

/** The line the model is given. Plain measurements, no instructions. */
export function renderSizes(sizes: Sizes): string | null {
  if (!hasSizes(sizes)) return null;

  const parts: string[] = [];
  if (sizes.tops) parts.push(`tops and knitwear ${sizes.tops}`);
  if (sizes.jacket) parts.push(`jackets ${sizes.jacket}`);
  if (sizes.waist && sizes.inseam) parts.push(`trousers ${sizes.waist}x${sizes.inseam}`);
  else if (sizes.waist) parts.push(`trouser waist ${sizes.waist}`);
  if (sizes.shoe) parts.push(`shoes US ${sizes.shoe}`);

  return `They wear: ${parts.join(", ")}. A piece that can't fit them is worthless however good it is — if a listing states a size that isn't theirs, reject it, and don't pick a garment whose photo shows an obviously different cut or size than the title claims.`;
}
