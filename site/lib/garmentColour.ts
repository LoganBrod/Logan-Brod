// Turning "mid-grey" into something you can paint with.
//
// The owned wardrobe keeps a line of text per garment and no photograph — the
// pictures are read once and thrown away, which is the whole reason the feature
// needs no storage service. That leaves one honest way to show someone their
// own wardrobe: hang a bag per piece, in the colour the model wrote down.
//
// So this maps the vocabulary a person actually uses about clothes onto hex.
// It is deliberately a lookup rather than a colour library: "oatmeal" and
// "ecru" are menswear words, not CSS ones, and a generic parser returns nothing
// useful for either.

/** The base vocabulary. Values are picked to read as fabric, not as ink. */
const BASE: Record<string, string> = {
  // neutrals
  black: "#1A1A1A",
  charcoal: "#3A3B3D",
  grey: "#8C8D8F",
  gray: "#8C8D8F",
  slate: "#6B7480",
  silver: "#BFC1C2",
  white: "#F2F1ED",
  ecru: "#E4DCC9",
  cream: "#EBE3D2",
  ivory: "#EFE9DA",
  oatmeal: "#D9CFBA",
  sand: "#D2C3A5",
  stone: "#C7BEAE",
  beige: "#CFBFA3",
  taupe: "#A99C8B",
  camel: "#B08B58",
  tan: "#B4894F",
  khaki: "#9A8A62",
  brown: "#6E5137",
  chocolate: "#4A3628",
  // colours
  navy: "#2A3550",
  blue: "#39597F",
  denim: "#4A6480",
  teal: "#2F5F5E",
  green: "#3F5B3A",
  olive: "#5A5F3A",
  sage: "#8E9B84",
  forest: "#2E4430",
  burgundy: "#5A2A32",
  maroon: "#5C2B2B",
  wine: "#55272F",
  red: "#8E3B34",
  rust: "#96502F",
  orange: "#B4703A",
  pink: "#C99A9A",
  purple: "#54455F",
  yellow: "#C4A44E",
  mustard: "#B08F3C",
  gold: "#B08F3C",
};

/** Modifiers that shift a base rather than replacing it. */
const LIGHTEN = ["light", "pale", "washed", "faded", "off", "bleached", "ice"];
const DARKEN = ["dark", "deep", "midnight", "ink", "jet"];

function clamp(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** Move a hex toward white or black by `amount` (0–1). */
export function shift(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (channel: number) => clamp(channel + (to - channel) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** When nothing matches. Reads as unbleached cotton rather than as an error. */
export const UNKNOWN_COLOUR = "#B9B2A4";

/**
 * The colour to paint a garment bag.
 *
 * Matches on the longest base word present, so "navy blue" resolves as navy
 * rather than blue, and applies one modifier if there is one. Anything it
 * cannot read gets the neutral — a wrong-but-confident colour on someone's own
 * wardrobe is worse than an obviously undecided one.
 */
export function garmentColour(description: string): string {
  const words = description.toLowerCase().match(/[a-z]+/g);
  if (!words?.length) return UNKNOWN_COLOUR;

  let base: string | null = null;
  for (const word of words) {
    if (BASE[word]) {
      base = BASE[word];
      // Keep looking: the last colour word wins, so "blue-grey" reads as grey
      // the way it does out loud.
    }
  }
  if (!base) return UNKNOWN_COLOUR;

  if (words.some((w) => DARKEN.includes(w))) return shift(base, -0.3);
  if (words.some((w) => LIGHTEN.includes(w))) return shift(base, 0.32);
  // "mid" is a real modifier in menswear and means "leave it alone".
  return base;
}

/** Whether text on this colour should be light. Rec. 601 luma, which is enough here. */
export function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma < 140;
}
