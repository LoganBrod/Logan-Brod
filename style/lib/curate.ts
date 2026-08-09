import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { CurationSchema, type Pick, type StyleProfile } from "./schemas";
import type { ItemAttributes } from "./taste";
import { MAX_VIEWED, PICKS_PER_BATCH } from "./batching";
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

const SYSTEM = `You are choosing which men's clothing, out of raw shopping-search results, is genuinely worth showing one specific person.

You can see each item's photo. Use it — the picture is the evidence, the title is just a claim. Sellers mislabel constantly, so when the two disagree, believe the photo.

Reject on sight, and don't spend reasoning on them: womenswear and kids' clothing, multi-item lots, mannequins with nothing distinctive, stock photos that show no actual garment, heavy wear or staining, and anything where the photo doesn't show the thing the title says it is.

Then judge fit against the wearer's style — colour, material, cut, formality — not against menswear in general. A beautiful piece that clashes with their palette is a bad recommendation.

Return only items you would defend. You are looking at one slice of a larger search and several slices are being judged at once, so pick the best few here rather than trying to assemble a whole wardrobe out of this batch — the results are merged afterwards and the best overall are kept. Fewer is fine if this slice came back thin, and padding to reach a number just means a weaker piece displaces a stronger one from another slice.

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

export async function curate(
  profile: StyleProfile,
  candidates: ProductListing[],
  /** What this browser has already accepted and rejected, from `lib/taste.ts`. */
  tasteMemo?: string | null,
  limit = PICKS_PER_BATCH
): Promise<CurationResult> {
  if (!candidates.length) {
    return { items: [], notes: "No listings came back from the shopping sources." };
  }

  const viewed = candidates.filter((c) => c.imageUrl).slice(0, MAX_VIEWED);
  if (!viewed.length) {
    return { items: [], notes: "None of the listings had a usable photo." };
  }

  // Each item is a label followed by its photo, so the id, price, and image stay
  // unambiguously associated.
  const content = viewed.flatMap((item) => [
    {
      type: "text" as const,
      text: `${item.id} | $${item.price.toFixed(2)} | ${item.condition ?? "condition unstated"} | ${item.title}`,
    },
    {
      type: "image" as const,
      source: { type: "url" as const, url: item.imageUrl! },
    },
  ]);

  const message = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      // Medium rather than high. This call is now one of several running at
      // once over a slice of the pool, and the judgement it makes — does this
      // photo show the thing the title claims, does it suit this palette — did
      // not measurably improve at high effort, while the latency did.
      effort: "medium",
      format: zodOutputFormat(CurationSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Here is the wearer's style profile:\n\n${renderProfile(profile)}${
              tasteMemo ? `\n\n${tasteMemo}` : ""
            }\n\nHere are ${viewed.length} candidates, each as a label line followed by its photo. Use the ids exactly as given, and return your best ${limit} or fewer.`,
          },
          ...content,
        ],
      },
    ],
  });

  assertNotRefused(message, "curation");
  const curation = requireParsed(message.parsed_output, "curation");

  // Rejoin against the real listings and drop anything hallucinated — a pick
  // whose id isn't in the candidate set has no URL, price, or image to render.
  const byId = new Map(viewed.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const items: CuratedItem[] = [];

  for (const pick of curation.picks as Pick[]) {
    const listing = byId.get(pick.id);
    if (!listing || seen.has(pick.id)) continue;
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

  // The count is enforced here as well as asked for: a batch that returns six
  // when it was asked for four would quietly out-vote the other batches in the
  // merge, which is the one thing batching must not let happen.
  items.sort((a, b) => b.score - a.score);
  return { items: items.slice(0, limit), notes: curation.notes };
}
