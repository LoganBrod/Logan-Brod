import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { StyleProfileSchema, type StyleProfile } from "./schemas";
import type { PriceRange } from "./sources/types";

const SYSTEM = `You are a menswear stylist reading a small set of pieces someone already likes, in order to extend their wardrobe in that direction.

Two things make your output good or useless:

Search queries must be specific enough to return the right garment on eBay or Google Shopping. "Brown suede chelsea boot" works. "Men's shoes" returns ten thousand things and is a wasted slot. Name the garment, and the material or colour that matters.

Recommend what is missing, not what is already there. If every upload is outerwear, the wardrobe does not need a fifth jacket — it needs the trousers and boots that would go under them. Read what the pieces have in common, then cover the gaps around them.

Write the summary and the per-query reasons to the wearer, in plain second person. No preamble.`;

export async function analyzeStyle(
  photoUrls: string[],
  range: PriceRange
): Promise<StyleProfile> {
  if (!photoUrls.length) {
    throw new Error("At least one photo is required.");
  }

  const message = await anthropic().messages.parse({
    model: MODEL,
    // Covers thinking and the response together — Opus 5 thinks by default.
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      effort: "high",
      format: zodOutputFormat(StyleProfileSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          ...photoUrls.map(
            (url) =>
              ({ type: "image", source: { type: "url", url } }) as const
          ),
          {
            type: "text",
            text: `These are ${photoUrls.length} piece${photoUrls.length === 1 ? "" : "s"} I like the look of.

Read the style across them, then give me six to eight things to buy that would extend it. My budget per item is $${range.min}-$${range.max}, so keep every suggested price band inside that.`,
          },
        ],
      },
    ],
  });

  assertNotRefused(message, "style analysis");
  const profile = requireParsed(message.parsed_output, "style analysis");

  // The schema can't express "6 to 8" (structured outputs reject array length
  // constraints), so the ceiling is enforced here to bound downstream fan-out.
  return { ...profile, searchQueries: profile.searchQueries.slice(0, 8) };
}
