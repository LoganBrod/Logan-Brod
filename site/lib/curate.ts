import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODELS, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { imageSize, meter } from "./meter";
import { CurationSchema, type Pick, type StyleProfile } from "./schemas";
import type { ItemAttributes } from "./taste";
import { MAX_VIEWED, PICKS_PER_BATCH } from "./batching";
import { withThumbnails } from "./thumbnails";
import type { ProductListing } from "./sources/types";

export interface CuratedItem extends ProductListing {
  score: number;
  whyItFits: string;
  /** What this piece is, for the statistics that steer the next run. */
  attrs: ItemAttributes;
}

export interface CurationResult {
  items: CuratedItem[];
  notes: string;
}

/**
 * The score below which a pick doesn't go on the rail.
 *
 * The system prompt has always said "return only items you would defend" and
 * "fewer is fine if this slice came back thin", and it was always ignored,
 * because the same message also asked for a specific number of picks. Asking is
 * not enough; a batch is only genuinely free to return nothing if something
 * downstream enforces it.
 *
 * Sixty on a hundred-point scale is deliberately not a high bar — it is the
 * line between "this suits him" and "this is the best of a bad slice", which is
 * the only distinction that matters here. Every batch is then free to come back
 * empty, and a run that finds three good pieces shows three.
 */
export const SCORE_FLOOR = 60;

/**
 * How hard the curation model thinks.
 *
 * Low. Thinking is billed as output, output is roughly two thirds of what a run
 * costs, and this call happens six times — so it is the largest single lever on
 * the price of a closet. And the question barely needs the depth: "does this
 * photo show the thing the title claims, and does it suit this palette" is a
 * recognition judgement rather than a reasoning one. It did not measurably
 * improve at high effort when that was tried, and the same argument runs in the
 * other direction.
 *
 * The floor in `selectPicks` is what makes it safe. A model thinking less is a
 * model more likely to wave something mediocre through, and before the floor
 * existed that went straight onto somebody's rail.
 *
 * Exported because `scripts/cost-model.mjs` prices the run from it. That script
 * used to keep its own copy of numbers like this one and they went stale in the
 * expensive direction.
 */
export const CURATE_EFFORT = "low" as const;

const SYSTEM = `You are choosing which men's clothing, out of raw shopping-search results, is genuinely worth showing one specific person.

You can see each item's photo. Use it — the picture is the evidence, the title is just a claim. Sellers mislabel constantly, so when the two disagree, believe the photo.

Reject on sight, and don't spend reasoning on them: womenswear and kids' clothing, multi-item lots, mannequins with nothing distinctive, stock photos that show no actual garment, heavy wear or staining, and anything where the photo doesn't show the thing the title says it is.

Then judge fit against the wearer's style — colour, material, cut, formality — not against menswear in general. A beautiful piece that clashes with their palette is a bad recommendation.

Return only items you would defend. You are looking at one slice of a larger search and several slices are being judged at once, so pick the best few here rather than trying to assemble a whole wardrobe out of this batch — the results are merged afterwards and the best overall are kept. Fewer is fine if this slice came back thin, and padding to reach a number just means a weaker piece displaces a stronger one from another slice.

Score honestly, and treat ${SCORE_FLOOR} as the line: below it the piece is dropped and never shown. Returning nothing at all from a slice with nothing good in it is the correct answer, not a failure — scoring a mediocre piece ${SCORE_FLOOR + 10} to keep it does not help this person, it just puts a garment on their rail that they will scroll past.

Tag every pick with its category, maker, material, and colour. These are counted across runs to learn what this person actually responds to, so they have to be consistent: the same material named the same way every time, and 'unknown' rather than a guess when the title and photo don't say.

Write each whyItFits to the wearer in one sentence, pointing at something concrete you can see in the photo and tying it to their profile. No generic praise.`;

function renderProfile(profile: StyleProfile): string {
  return [
    `Summary: ${profile.summary}`,
    `Aesthetics: ${profile.aesthetics.join(", ")}`,
    `Palette: ${profile.palette.map((p) => p.name).join(", ")}`,
    `Silhouette: ${profile.silhouette}`,
    `Fabrics: ${profile.fabrics.join(", ")}`,
    `Formality: ${profile.formality}`,
    `Gaps to fill: ${profile.gaps.join(", ")}`,
  ].join("\n");
}

/**
 * Turn the model's picks into things that can actually hang on a rail.
 *
 * Three jobs, and each one is a rule the prompt asks for and cannot enforce:
 *
 *   - **Real.** A pick whose id isn't in the candidate set is invented, and has
 *     no URL, price, or photo to render.
 *   - **Good enough.** Below `SCORE_FLOOR` the piece is dropped. The prompt has
 *     always said "fewer is fine if this slice came back thin" and it was always
 *     ignored, because the same message also asked for a specific number of
 *     picks. A batch is only genuinely free to return nothing if something here
 *     lets it.
 *   - **Within quota.** A batch that returns six when it was asked for two would
 *     quietly out-vote the other batches in the merge, which is the one thing
 *     batching must not allow.
 *
 * Separate from `curate` so it can be tested without buying any tokens.
 */
export function selectPicks(
  picks: Pick[],
  viewed: ProductListing[],
  limit: number
): { items: CuratedItem[]; belowFloor: number } {
  const byId = new Map(viewed.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const items: CuratedItem[] = [];
  let belowFloor = 0;

  for (const pick of picks) {
    const listing = byId.get(pick.id);
    if (!listing || seen.has(pick.id)) continue;
    if (pick.score < SCORE_FLOOR) {
      belowFloor += 1;
      continue;
    }
    seen.add(pick.id);
    items.push({
      ...listing,
      score: pick.score,
      whyItFits: pick.whyItFits,
      attrs: {
        category: pick.category,
        brand: pick.brand,
        material: pick.material,
        colour: pick.colour,
      },
    });
  }

  items.sort((a, b) => b.score - a.score);
  return { items: items.slice(0, limit), belowFloor };
}

/** How many uploads are worth showing the judge. Beyond a few they stop adding signal. */
const MAX_REFERENCE = 4;

export async function curate(
  profile: StyleProfile,
  candidates: ProductListing[],
  /** What this browser has already accepted and rejected, from `lib/taste.ts`. */
  tasteMemo?: string | null,
  limit = PICKS_PER_BATCH,
  /**
   * The pieces the person actually uploaded, small.
   *
   * Until now this call judged candidates against `renderProfile` alone — a
   * paragraph of prose describing a palette and a silhouette. The model doing
   * the choosing had never seen a single thing the person liked, only a
   * paraphrase of it, so it was matching photographs against a description
   * rather than against the clothes. A stylist would hold the two side by side.
   */
  uploads?: Array<{ data: string; mediaType: string }>
): Promise<CurationResult> {
  if (!candidates.length) {
    return { items: [], notes: "No listings came back from the shopping sources." };
  }

  // Photos are fetched here and sent inline rather than handed over as URLs.
  // The API's own fetcher honours robots.txt, which Google's thumbnail CDN
  // disallows — and a single rejected URL fails the entire message, so one
  // retail listing used to take a whole batch of sixteen down with it. A photo
  // that can't be fetched now costs exactly its own candidate.
  const fetched = await withThumbnails(candidates.filter((c) => c.imageUrl).slice(0, MAX_VIEWED));
  if (!fetched.length) {
    return { items: [], notes: "None of the listings had a photo that could be loaded." };
  }

  const viewed = fetched.map((entry) => entry.listing);

  // Capped rather than trusted: this arrives over the wire, and six batches
  // each repeating a large set of uploads is how a cheap idea becomes the most
  // expensive part of a run.
  const reference = (uploads ?? []).slice(0, MAX_REFERENCE);

  // Each item is a label followed by its photo, so the id, price, and image stay
  // unambiguously associated.
  const content = fetched.flatMap(({ listing, image }) => [
    {
      type: "text" as const,
      text: `${listing.id} | $${listing.price.toFixed(2)} | ${listing.condition ?? "condition unstated"} | ${listing.title}`,
    },
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: image.mediaType as "image/jpeg",
        data: image.data,
      },
    },
  ]);

  const message = await anthropic().messages.parse({
    model: MODELS.curate,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      effort: CURATE_EFFORT,
      format: zodOutputFormat(CurationSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          // The uploads go first, before the profile and before the
          // candidates: they are the thing being matched against, and putting
          // them last would make them read as an afterthought to the prose.
          ...(reference.length
            ? [
                {
                  type: "text" as const,
                  text: `These ${reference.length === 1 ? "is the piece" : `are the ${reference.length} pieces`} the wearer uploaded — what they already like. This is the target. Judge every candidate below against these photographs first and the written profile second; where the two disagree, believe the photographs.`,
                },
                ...reference.map((photo) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: photo.mediaType as "image/jpeg",
                    data: photo.data,
                  },
                })),
              ]
            : []),
          {
            type: "text",
            text: `${reference.length ? "In writing, the same wearer's" : "Here is the wearer's"} style profile:\n\n${renderProfile(profile)}${
              tasteMemo ? `\n\n${tasteMemo}` : ""
            }\n\nHere are ${viewed.length} candidates, each as a label line followed by its photo. Use the ids exactly as given, and return your best ${limit} or fewer.`,
          },
          ...content,
        ],
      },
    ],
  });

  assertNotRefused(message, "curation");

  const kept: CuratedItem[] = [];
  let belowFloor = 0;

  // The meter runs in a `finally` rather than in line. The tokens are spent the
  // moment the message comes back, so a batch whose output won't parse still
  // has to appear in the cost log — and the counts below are worth having in
  // the same record, because a closet that comes back with three pieces should
  // be legible as the floor doing its job rather than as something breaking.
  try {
    const curation = requireParsed(message.parsed_output, "curation");
    const selected = selectPicks(curation.picks as Pick[], viewed, limit);
    belowFloor = selected.belowFloor;
    kept.push(...selected.items);

    return { items: kept, notes: curation.notes };
  } finally {
    meter({
      op: "curate",
      model: MODELS.curate,
      usage: message.usage,
      images: fetched.map(({ image }) => imageSize(image.data)),
      extra: {
        candidatesOffered: candidates.length,
        candidatesViewed: viewed.length,
        limit,
        reference: reference.length,
        kept: kept.length,
        belowFloor,
      },
    });
  }
}
