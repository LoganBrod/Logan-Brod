import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { OutfitsSchema, type Outfit, type StyleProfile } from "./schemas";
import type { CuratedItem } from "./curate";

const SYSTEM = `You assemble complete outfits from a shortlist someone has already been recommended.

An outfit is wearable only if the slots don't collide — one top layer, one pair of trousers, one pair of shoes. Two overcoats in the same outfit is a mistake, not a look.

Only use items from the shortlist, by their exact id. If the shortlist can't support three coherent outfits, build two. Two that work are worth more than three that don't.

Write the styling note to the wearer: how it goes together, what to cuff or leave open, what the proportions want.`;

export async function buildOutfits(
  profile: StyleProfile,
  items: CuratedItem[]
): Promise<Outfit[]> {
  // Below three items there is nothing to assemble.
  if (items.length < 3) return [];

  const message = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(OutfitsSchema),
    },
    messages: [
      {
        role: "user",
        content: `The wearer's style: ${profile.summary}
Formality: ${profile.formality}
Silhouette: ${profile.silhouette}

Their shortlist, as "id | price | title":

${items.map((i) => `${i.id} | $${i.price.toFixed(2)} | ${i.title}`).join("\n")}

Build two or three outfits from these.`,
      },
    ],
  });

  assertNotRefused(message, "outfit");
  const parsed = requireParsed(message.parsed_output, "outfit");

  // Keep only ids that really exist, then drop any outfit left too thin to wear.
  const known = new Set(items.map((i) => i.id));
  return parsed.outfits
    .map((outfit) => ({
      ...outfit,
      itemIds: outfit.itemIds.filter((id) => known.has(id)),
    }))
    .filter((outfit) => outfit.itemIds.length >= 2)
    .slice(0, 3);
}
