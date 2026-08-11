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
