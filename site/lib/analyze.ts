import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODELS, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { imageSize, meter } from "./meter";
import { StyleProfileSchema, type StyleProfile } from "./schemas";
import type { PriceRange } from "./sources/types";

const SYSTEM = `You are a menswear stylist reading a small set of pieces someone already likes, in order to extend their wardrobe in that direction.

Your queries are typed straight into eBay and Google Shopping, so they live or die on how a seller would have titled the thing. Write them the way a listing reads: garment noun, plus the material, colour, or cut that actually matters. "Waxed cotton field jacket olive" finds it. "Brown suede chelsea boot" finds it. "Men's shoes" returns ten thousand things and wastes a slot. A well-known maker is worth naming when the style clearly points at one — "Barbour waxed jacket", "Red Wing moc toe" — because on a secondhand market that is how the good listings are titled. Never invent a brand the pieces don't suggest.

Vary the queries across garment types. Eight near-identical jacket searches return the same jacket eight times; the point is coverage.

Everything you suggest is men's clothing. Don't waste query words saying so — the search is already scoped to menswear, and "mens" in the query just crowds out a more useful term.

Write the summary and the per-query reasons to the wearer, in plain second person. No preamble.`;

/**
 * The two things someone can mean by uploading clothes they like.
 *
 * This used to be one instruction — fill the gaps — and it was wrong as a
 * default. Somebody who uploads three jackets they love is asking for jackets.
 * The app read the uploads, worked out they were outerwear, and deliberately
 * searched for trousers and boots instead, so the honest response to "none of
 * these were my style" was that the product had been told not to return their
 * style. Filling gaps is a real and more advanced request; it is not what
 * anybody means the first time.
 */
export type Intent = "similar" | "gaps";

const INTENT: Record<Intent, string> = {
  similar: `Find more of what they showed you. Same garment types, same register, same colours and materials — the pieces they uploaded are the target, not a starting point to move away from. Vary maker, cut and detail so the results are not eight of the same coat, but stay inside the kind of thing they picked. If every upload is outerwear, return outerwear.`,

  gaps: `Recommend what is missing, not what is already there. If every upload is outerwear, the wardrobe does not need a fifth jacket — it needs the trousers and boots that would go under them. Read what the pieces have in common, then cover the gaps around them.`,
};

export interface PhotoInput {
  /** Raw base64, no data: prefix. */
  data: string;
  mediaType: string;
}

export async function analyzeStyle(
  photos: PhotoInput[],
  range: PriceRange,
  /** What this browser has already accepted and rejected, from `lib/taste.ts`. */
  tasteMemo?: string | null,
  /** What they actually own, from `lib/wardrobeOwned.ts`. */
  ownedMemo?: string | null,
  /** More of the same, or the pieces that would go with it. Defaults to more. */
  intent: Intent = "similar"
): Promise<StyleProfile> {
  if (!photos.length) {
    throw new Error("At least one photo is required.");
  }

  const message = await anthropic().messages.parse({
    model: MODELS.analyze,
    // Covers thinking and the response together — Opus 5 thinks by default.
    max_tokens: 8000,
    system: `${SYSTEM}\n\n${INTENT[intent]}`,
    output_config: {
      effort: "high",
      format: zodOutputFormat(StyleProfileSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          // Sent inline rather than by URL, so the photos never have to be
          // hosted anywhere public for the API to reach them.
          ...photos.map(
            (photo) =>
              ({
                type: "image",
                source: {
                  type: "base64",
                  media_type: photo.mediaType as "image/jpeg",
                  data: photo.data,
                },
              }) as const
          ),
          {
            type: "text",
            text: `These are ${photos.length} piece${photos.length === 1 ? "" : "s"} I like the look of.

Read the style across them, then give me eight to ten things to buy that would extend it, spread across different garment types. My budget per item is $${range.min}-$${range.max}, so keep every suggested price band inside that.${
              ownedMemo ? `\n\n${ownedMemo}` : ""
            }${tasteMemo ? `\n\n${tasteMemo}` : ""}`,
          },
        ],
      },
    ],
  });

  assertNotRefused(message, "style analysis");

  meter({
    op: "closet.analyze",
    model: MODELS.analyze,
    usage: message.usage,
    images: photos.map((photo) => imageSize(photo.data)),
  });
  const profile = requireParsed(message.parsed_output, "style analysis");

  // The schema can't express a count (structured outputs reject array length
  // constraints), so the ceiling is enforced here to bound downstream fan-out.
  return { ...profile, searchQueries: profile.searchQueries.slice(0, 10) };
}
