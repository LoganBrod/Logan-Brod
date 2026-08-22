import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { MODELS, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { meter } from "./meter";
import type { StyleProfile } from "./schemas";
import { ACCESSORY_KINDS, MAX_KINDS, isAccessoryKind, type AccessoryKind } from "./accessoryKinds";

export { ACCESSORY_KINDS, MAX_KINDS, isAccessoryKind };
export type { AccessoryKind };

/**
 * Accessories, from a style you already established.
 *
 * Deliberately not a second clozet. Nobody has photographs of belts to hand,
 * and asking for them would mean a full second run at full price for the part
 * of an outfit that costs the least. The profile from somebody's last clozet
 * already says what their palette and register are, and that is exactly what
 * choosing a belt needs — so this reuses it and asks only which kinds of thing
 * they want.
 *
 * One text-only model call to write the searches, then the same shopping and
 * curation pipeline as everything else.
 */

const SYSTEM = `You are writing shopping searches for men's accessories, for someone whose clothing style you already know.

Your queries are typed straight into eBay and Google Shopping, so write them the way a seller titles a listing: the noun, plus the material, colour or detail that actually matters. "Brown bridle leather belt" finds it. "Accessories" does not.

Accessories are the part of an outfit that most often goes wrong, and it goes wrong by being louder than the clothes. Match the register of the profile rather than decorating it — somebody whose wardrobe is washed cotton and olive does not want a polished dress belt, and somebody in tailoring does not want a canvas webbing one.

Two or three searches per kind of accessory asked for, varying material and colour within what the profile supports. Never invent a brand the profile doesn't suggest.

Write each reason to the wearer in one sentence, in plain second person.`;

const AccessoryQuerySchema = z.object({
  query: z.string().describe("The search, as typed into a shopping site."),
  kind: z
    .enum(ACCESSORY_KINDS.map((k) => k.value) as [AccessoryKind, ...AccessoryKind[]])
    .describe("Which of the requested kinds this search is for."),
  minPrice: z.number().describe("Low end of the sensible band, in USD."),
  maxPrice: z.number().describe("High end of the sensible band, in USD."),
  reason: z.string().describe("One sentence, to the wearer, on why this suits them."),
});

const AccessoryPlanSchema = z.object({
  summary: z
    .string()
    .describe("One or two sentences to the wearer on how accessories should sit with their clothes."),
  queries: z.array(AccessoryQuerySchema),
});

export type AccessoryQuery = z.infer<typeof AccessoryQuerySchema>;
export interface AccessoryPlan {
  summary: string;
  queries: AccessoryQuery[];
}

/** How many searches one accessories run fans out to. */
export const MAX_ACCESSORY_QUERIES = 10;

function renderProfile(profile: StyleProfile): string {
  return [
    `Summary: ${profile.summary}`,
    `Aesthetics: ${profile.aesthetics.join(", ")}`,
    `Palette: ${profile.palette.map((p) => p.name).join(", ")}`,
    `Silhouette: ${profile.silhouette}`,
    `Fabrics: ${profile.fabrics.join(", ")}`,
    `Formality: ${profile.formality}`,
  ].join("\n");
}

export async function planAccessories(
  profile: StyleProfile,
  kinds: AccessoryKind[],
  range: { min: number; max: number },
  /** What they told us about themselves, already rendered. */
  preferences?: string | null
): Promise<AccessoryPlan> {
  const wanted = kinds.filter(isAccessoryKind).slice(0, MAX_KINDS);
  if (!wanted.length) return { summary: "", queries: [] };

  const message = await anthropic().messages.parse({
    model: MODELS.analyze,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      // No images and a short answer — this is the cheapest model call in the
      // app and there is nothing here that rewards more thinking.
      effort: "low",
      format: zodOutputFormat(AccessoryPlanSchema),
    },
    messages: [
      {
        role: "user",
        content: `Here is the wearer's clothing style, read from pieces they already like:

${renderProfile(profile)}${preferences ? `\n\n${preferences}` : ""}

They want accessories in these kinds: ${wanted.join(", ")}.

Their budget per piece is $${range.min}-$${range.max}, so keep every price band inside that. Give me up to ${MAX_ACCESSORY_QUERIES} searches in total, covering every kind they asked for.`,
      },
    ],
  });

  assertNotRefused(message, "accessories");

  const plan = requireParsed(message.parsed_output, "accessories");

  meter({
    op: "accessories.plan",
    model: MODELS.analyze,
    usage: message.usage,
    extra: { kinds: wanted.length, queries: plan.queries.length },
  });

  // Only kinds they actually asked for, and only as many searches as the
  // shopping stage will spend. The model is told both; neither is trusted.
  const asked = new Set(wanted);
  return {
    summary: plan.summary,
    queries: plan.queries.filter((q) => asked.has(q.kind)).slice(0, MAX_ACCESSORY_QUERIES),
  };
}
