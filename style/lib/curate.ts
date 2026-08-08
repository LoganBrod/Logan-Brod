import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { CurationSchema, type Pick, type StyleProfile } from "./schemas";
import type { ProductListing } from "./sources/types";

export interface CuratedItem extends ProductListing {
  score: number;
  whyItFits: string;
}

export interface CurationResult {
  items: CuratedItem[];
  notes: string;
}

const SYSTEM = `You are filtering keyword-search results down to the ones that actually suit a specific person's style.

The candidate list is raw search output, so a good portion of it is wrong — mismatched garments, womenswear, kids' sizes, bulk lots, accessories for a different aesthetic entirely. Cutting those is most of the job. A short list the wearer trusts beats a long one they have to sift.

You are working from titles and prices alone, with no images. Where a title is too vague to tell what the garment actually is, leave it out rather than guessing.

Write each whyItFits to the wearer in one sentence, tied to something concrete in their profile — a colour, a fabric, a proportion — not generic praise.`;

/** Titles are the whole signal here; keep the block compact but complete. */
function renderCandidates(candidates: ProductListing[]): string {
  return candidates
    .map(
      (c) =>
        `${c.id} | $${c.price.toFixed(2)} | ${c.condition ?? "unspecified"} | ${c.merchant ?? "unknown seller"} | ${c.title}`
    )
    .join("\n");
}

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
  candidates: ProductListing[]
): Promise<CurationResult> {
  if (!candidates.length) {
    return { items: [], notes: "No listings came back from the shopping sources." };
  }

  const message = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(CurationSchema),
    },
    messages: [
      {
        role: "user",
        content: `Here is the wearer's style profile:

${renderProfile(profile)}

Here are ${candidates.length} candidates as "id | price | condition | seller | title":

${renderCandidates(candidates)}

Pick the twelve to eighteen that genuinely fit. Use the ids exactly as given.`,
      },
    ],
  });

  assertNotRefused(message, "curation");
  const curation = requireParsed(message.parsed_output, "curation");

  // Rejoin against the real listings and drop anything hallucinated — a pick
  // whose id isn't in the candidate set has no URL, price, or image to render.
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const items: CuratedItem[] = [];

  for (const pick of curation.picks as Pick[]) {
    const listing = byId.get(pick.id);
    if (!listing || seen.has(pick.id)) continue;
    seen.add(pick.id);
    items.push({ ...listing, score: pick.score, whyItFits: pick.whyItFits });
  }

  items.sort((a, b) => b.score - a.score);
  return { items, notes: curation.notes };
}
