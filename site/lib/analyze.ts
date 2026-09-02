import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODELS, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { imageSize, meter } from "./meter";
import { StyleProfileSchema, type StyleProfile } from "./schemas";
import type { PriceRange } from "./sources/types";
import { capBySlot, normaliseSlot, queryCapFor } from "./categories";

/** How many searches one run fans out to. Bounds the shopping stage. */
export const MAX_QUERIES = 10;

const SYSTEM = `You are a menswear stylist reading a small set of pieces someone already likes, in order to extend their wardrobe in that direction.

Your queries are typed straight into eBay and Google Shopping, so they live or die on how a seller would have titled the thing. Write them the way a listing reads: garment noun, plus the material, colour, or cut that actually matters. "Waxed cotton field jacket olive" finds it. "Heavyweight flannel overshirt charcoal" finds it. "Pleated wool trouser grey" finds it. "Men's shoes" returns ten thousand things and wastes a slot. A well-known maker is worth naming when the style clearly points at one — "Barbour waxed jacket", "Levi's 501 selvedge" — because on a secondhand market that is how the good listings are titled. Never invent a brand the pieces don't suggest.

Spread the queries across garment types, and count them as you go. This is the instruction that gets ignored most often, so it is worth being blunt: a wardrobe is mostly things you wear on your torso and legs. Footwear is one slot in an outfit and should be one or two searches out of ten, never four. The same goes for any single type — eight near-identical jacket searches return the same jacket eight times. Tag each query with the slot it fills so the spread can be checked.

Everything you suggest is men's clothing. Don't waste query words saying so — the search is already scoped to menswear, and "mens" in the query just crowds out a more useful term.

The photographs are the only account of their style you have, and the only one you need. Read what is actually in front of you — not what somebody with these clothes is generally like, and not a safer version of it. If this set looks nothing like the sort of thing you would expect, that is the answer, not a mistake to correct.

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

/**
 * Read a style off a set of photographs.
 *
 * Note what this function does *not* take: the taste memory. It used to, and
 * that was the bug behind "I put in a completely different vibe and it kept the
 * one from last time".
 *
 * The memory is a paragraph asserting general facts about a person — "they
 * engage with olive, waxed cotton, outerwear" — and handing it to the one step
 * whose entire job is reading *these* photographs meant the model was asked two
 * questions at once and answered a blend of them. Since this step writes the
 * search queries, that blend then decided everything downstream: somebody who
 * uploaded tailoring got searches for the workwear they liked in March.
 *
 * The memory still has a real use, but it is in curation, where it can break a
 * tie between candidates that already match the profile these photographs
 * produced. It cannot be allowed to decide what gets searched for in the first
 * place. See the note on `tasteMemo` in lib/curate.ts.
 */
export async function analyzeStyle(
  photos: PhotoInput[],
  range: PriceRange,
  /** What they actually own, from `lib/wardrobeOwned.ts`. */
  ownedMemo?: string | null,
  /** More of the same, or the pieces that would go with it. Defaults to more. */
  intent: Intent = "similar",
  /** What they told us about themselves, from `lib/preferences.ts`. */
  preferences?: string | null,
  /**
   * The makers they named, raw, so the queries can be checked against them.
   * The prompt asks for at most two; this is what makes the ask true.
   */
  namedMakers: string[] = []
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
              // Their own answers come before the inferred history: what
              // somebody just told you they want outranks what a counter
              // noticed they clicked on last month.
              preferences ? `\n\n${preferences}` : ""
            }${ownedMemo ? `\n\n${ownedMemo}` : ""}`,
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

  // Two limits, both enforced here because the schema can express neither:
  // structured outputs reject array-length constraints, and no schema can say
  // "at most three of these may be footwear".
  //
  // The spread runs before the ceiling, so trimming an over-represented slot
  // makes room for the varied queries further down the list rather than
  // throwing them away with everything past the tenth.
  const spread = capBySlot(
    profile.searchQueries,
    (query) => normaliseSlot(query.category),
    queryCapFor
  );

  return {
    ...profile,
    searchQueries: limitNamedMakers(spread, namedMakers).slice(0, MAX_QUERIES),
  };
}

/**
 * How many of the queries may be steered by a maker the wearer named.
 *
 * Two of ten. Enough that "Barbour" finds the good Barbour listings a
 * secondhand market titles by name; few enough that the other eight are the
 * register around it rather than the same two labels eight times. A named
 * maker is a clue about what somebody likes, not a blueprint of what to show.
 */
export const MAX_NAMED_MAKER_QUERIES = 2;

/**
 * Keep the first two queries that name a maker the wearer gave; strip the
 * maker from the rest so they still search by garment, material and cut.
 *
 * Stripped rather than dropped: "Barbour waxed jacket olive" minus "Barbour"
 * is still a good query, and dropping it would spend a slot on nothing. A
 * query that is nothing but the maker is dropped, because "Red Wing" alone
 * returns everything Red Wing has ever made. Order is preserved.
 */
export function limitNamedMakers<T extends { query: string }>(
  queries: T[],
  makers: string[],
  max: number = MAX_NAMED_MAKER_QUERIES
): T[] {
  const named = makers.map((m) => m.trim()).filter(Boolean);
  if (!named.length) return queries;

  const patterns = named.map(
    (m) => new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")
  );
  let kept = 0;
  const out: T[] = [];
  for (const entry of queries) {
    const mentions = patterns.some((re) => (re.lastIndex = 0, re.test(entry.query)));
    if (!mentions) {
      out.push(entry);
      continue;
    }
    if (kept < max) {
      kept += 1;
      out.push(entry);
      continue;
    }
    let stripped = entry.query;
    for (const re of patterns) stripped = stripped.replace(re, " ");
    stripped = stripped.replace(/\s+/g, " ").trim();
    if (stripped.split(" ").length >= 2) out.push({ ...entry, query: stripped });
  }
  return out;
}
