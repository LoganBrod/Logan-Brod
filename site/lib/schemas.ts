// Schemas for the three Claude passes.
//
// These import from `zod/v4` rather than `zod` because the SDK's
// `zodOutputFormat` is typed against that subpath — importing from plain `zod`
// type-errors at the call site.
//
// Structured outputs reject several JSON Schema keywords, so there are no
// `.min()` / `.max()` numeric constraints here. Counts are requested in the
// prompt and clamped in code afterwards.

import * as z from "zod/v4";

export const SearchQuerySchema = z.object({
  query: z
    .string()
    .describe(
      "A specific menswear search query, as typed into a shopping site. Name the garment, material, and colour — 'brown suede chelsea boot', not 'men's shoes'."
    ),
  category: z
    .string()
    .describe("Broad slot this fills: outerwear, tops, bottoms, footwear, or accessories."),
  minPrice: z.number().describe("Low end of the sensible band for this item, in USD."),
  maxPrice: z.number().describe("High end of the sensible band for this item, in USD."),
  reason: z
    .string()
    .describe("One sentence on why this extends the uploaded pieces rather than duplicating them."),
});

export const StyleProfileSchema = z.object({
  summary: z
    .string()
    .describe("Two or three sentences describing the style as a whole, addressed to the wearer."),
  aesthetics: z
    .array(z.string())
    .describe("Two to four named aesthetics, e.g. 'workwear', 'ivy', 'techwear'."),
  palette: z
    .array(
      z.object({
        name: z.string().describe("Plain colour name, e.g. 'washed indigo'."),
        hex: z.string().describe("Approximate hex code, including the leading #."),
      })
    )
    .describe("Four to six colours that characterise the uploads."),
  silhouette: z.string().describe("How these pieces fit and drape — cut, volume, proportion."),
  fabrics: z.array(z.string()).describe("Materials and textures that recur across the uploads."),
  formality: z
    .string()
    .describe("Where this sits on casual-to-formal, in a short phrase."),
  gaps: z
    .array(z.string())
    .describe("Slots missing from the uploads that would round the wardrobe out."),
  searchQueries: z
    .array(SearchQuerySchema)
    .describe(
      "Eight to ten queries spread across different garment types, covering the gaps, priced inside the user's stated range."
    ),
});

/**
 * A closed vocabulary, because these become statistics keys.
 *
 * Left open, the same garment comes back as "jacket", "Jacket", "field jacket"
 * and "outerwear" across four runs, and the counters fragment into four facets
 * that each stay below the threshold where any of them could say anything.
 */
export const CategorySchema = z.enum([
  "jacket",
  "coat",
  "knitwear",
  "shirt",
  "tee",
  "trousers",
  "jeans",
  "shorts",
  "suiting",
  "boots",
  "shoes",
  "sneakers",
  "bag",
  "accessory",
  "other",
]);

export const PickSchema = z.object({
  id: z.string().describe("The exact candidate id being picked. Never invent one."),
  score: z.number().describe("0-100 fit against the style profile."),
  whyItFits: z
    .string()
    .describe("One sentence, addressed to the wearer, on why this suits their style."),
  // Tagged here rather than in a pass of its own: this call is already looking
  // at the photo and the title, so the attributes cost nothing but output.
  category: CategorySchema.describe("Which kind of garment this is."),
  brand: z
    .string()
    .describe(
      "The maker, lowercase, or 'unknown' if the title doesn't name one. Never guess from the look."
    ),
  material: z
    .string()
    .describe(
      "The dominant material in two words at most — 'waxed cotton', 'shetland wool', 'suede'. 'unknown' if neither the title nor the photo makes it clear."
    ),
  colour: z
    .string()
    .describe("The dominant colour in plain words — 'olive', 'navy', 'tan'."),
});

export const CurationSchema = z.object({
  picks: z
    .array(PickSchema)
    .describe(
      "The best candidates in this batch that genuinely fit, best first, up to the number asked for. Fewer is correct when the batch came back thin — never pad."
    ),
  notes: z
    .string()
    .describe("One short line on what you rejected and why, so the user can adjust their range."),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type Pick = z.infer<typeof PickSchema>;
export type Curation = z.infer<typeof CurationSchema>;

/**
 * A verdict on one piece.
 *
 * Deliberately not a score out of ten. The question people ask is "should I buy
 * this", and an answer that hedges into a number makes them do the deciding
 * again — so the verdict comes first and everything else explains it.
 */
export const JudgementSchema = z.object({
  verdict: z
    .enum(["yes", "maybe", "no"])
    .describe("Straight answer. 'maybe' only when it genuinely turns on something you can't see."),
  headline: z
    .string()
    .describe("One sentence to the wearer, saying the answer and the single reason behind it."),
  forIt: z
    .array(z.string())
    .describe("Up to three short points in its favour, each pointing at something in the photo."),
  againstIt: z
    .array(z.string())
    .describe("Up to three honest reservations. Never empty for a 'maybe' or a 'no'."),
  onPrice: z
    .string()
    .describe("One line on whether the asking price is fair for this piece in this condition."),
  onFit: z
    .string()
    .describe(
      "One line on size and cut against what they wear. Say plainly when the listing doesn't state a size."
    ),
});

export type Judgement = z.infer<typeof JudgementSchema>;

/** One garment someone actually owns, read off a photograph. */
export const OwnedItemSchema = z.object({
  label: z.string().describe("What to call it in a list: 'olive waxed field jacket'. No brand unless it's legible."),
  category: CategorySchema,
  colour: z.string().describe("Dominant colour in plain words."),
  material: z.string().describe("Dominant material in two words at most, or 'unknown'."),
  formality: z
    .string()
    .describe("One word: casual, smart-casual, or formal. What this piece is actually worn for."),
  season: z
    .string()
    .describe("One word: warm, cold, or year-round. Judged on weight and material, not colour."),
});

export const WardrobeReadSchema = z.object({
  items: z
    .array(OwnedItemSchema)
    .describe("One entry per distinct garment visible. Ignore anything that isn't clothing."),
});

/**
 * An outfit, referring to owned pieces by index.
 *
 * Indexes rather than names: a model asked to repeat a label will paraphrase it,
 * and then nothing can be matched back to the wardrobe it came from.
 */
export const OutfitSchema = z.object({
  name: z.string().describe("Three or four words. What the outfit is for, not what's in it."),
  itemIndexes: z.array(z.number()).describe("Indexes into the numbered wardrobe, exactly as given."),
  occasion: z.string().describe("One short line on where this actually goes."),
  note: z.string().describe("One sentence on why it works — proportion, colour, texture."),
});

export const OutfitsSchema = z.object({
  outfits: z.array(OutfitSchema).describe("Outfits built only from the pieces listed. Never invent a garment."),
  missing: z
    .string()
    .describe(
      "The single piece that would unlock the most further outfits from what they already own. Name the garment, not a brand."
    ),
  missingUnlocks: z
    .number()
    .describe("Roughly how many additional outfits that one piece would make possible."),
});

export type OwnedItem = z.infer<typeof OwnedItemSchema>;
export type Outfit = z.infer<typeof OutfitSchema>;
export type Outfits = z.infer<typeof OutfitsSchema>;

/**
 * What size to buy from one brand, read off that brand's own size guide and
 * whatever the internet says about how it fits.
 *
 * `confidence` is load-bearing rather than decorative. This pass reads pages
 * that may not mention the brand at all, and an answer given with the same
 * certainty whether it found a size chart or a single forum post is worse than
 * no answer — so the schema forces the model to say which it had.
 */
export const FitAdviceSchema = z.object({
  recommendation: z
    .string()
    .describe(
      "The size to buy, as that brand writes it: 'L', '42R', '34x32', 'US 10'. If the sources genuinely don't support a specific size, say so in a few words instead of guessing."
    ),
  runs: z
    .enum(["small", "true", "large", "unknown"])
    .describe("How this brand fits relative to a standard US size, according to the sources."),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "high only when a source gave an actual size chart with measurements. medium for consistent fit reports without a chart. low for thin or conflicting evidence."
    ),
  reasoning: z
    .string()
    .describe(
      "Two or three sentences addressed to the wearer, citing what the sources actually said. Name the measurement you matched against when there was one."
    ),
  cautions: z
    .array(z.string())
    .describe(
      "Short warnings worth knowing before buying — vintage sizing differing from current, a cut that's slim through the chest, shrinkage on wash. Empty when there are none."
    ),
  sources: z
    .array(z.string())
    .describe("The titles of the pages the advice actually came from. Never invent one."),
});

export type FitAdvice = z.infer<typeof FitAdviceSchema>;
