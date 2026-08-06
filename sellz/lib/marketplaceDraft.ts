import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getPlaybook, getSellerSettings, type Listing } from "./store";
import { MARKETPLACES, type MarketplaceId, type MarketplaceSpec } from "./marketplaces";

/**
 * Rewrite an eBay listing for a marketplace that ranks differently.
 *
 * One generator rather than one per site. The differences between Depop,
 * Vinted and Grailed are real but they are parameters — is there a title
 * field, how many tags, what counts as stale, what does the audience know —
 * and those live in lib/marketplaces.ts. This file only knows how to turn a
 * spec into a prompt and validate what comes back.
 *
 * The eBay listing is the source of facts for all of them, so the drafts can
 * never disagree about what the item actually is.
 */

const DraftSchema = z.object({
  title: z
    .string()
    .describe(
      "The listing title, if this marketplace has a title field. Empty string when it does not."
    ),
  description: z.string().describe("The listing description, ready to paste"),
  hashtags: z
    .array(z.string())
    .describe("Hashtags without the # symbol, lower case. Empty array if this site has no tag field."),
  brand: z.string().describe("Brand, or empty string if unbranded"),
  size: z.string().describe("Size as printed on the tag"),
  category: z.string().describe("Top-level category on this marketplace"),
  subcategory: z.string().describe("Subcategory on this marketplace"),
  condition: z.string().describe("Must be exactly one of the condition options given"),
  colour: z.string().describe("Main colour, single word where possible"),
  source: z.string().describe("Vintage, Thrifted, Handmade, Retail or Own brand"),
  age: z.string().describe("Decade if period-specific, e.g. '1990s', else empty string"),
  measurements: z
    .string()
    .describe(
      "Measurements where the marketplace expects them. If the source listing doesn't have them, name the ones the seller still needs to take. Empty string if not applicable."
    ),
  price: z.number().describe("Asking price in dollars for this marketplace specifically"),
  priceNote: z.string().describe("One sentence on why this price, versus the eBay ask"),
  photoPlan: z
    .array(z.string())
    .describe("3-5 specific shots for THIS item, in order, best first"),
  vibe: z.string().describe("The aesthetic or category this sits in, two or three words"),
});

export type MarketplaceDraft = z.infer<typeof DraftSchema>;

function buildPrompt(spec: MarketplaceSpec, ebayPrice: number): string {
  return `You rewrite an existing eBay listing for ${spec.name}. These are different jobs, and a good eBay listing makes a bad ${spec.name} listing.

eBay's Cassini ranks on keyword match against a long structured title, complete item specifics, and conversion. It rewards an exhaustive literal title because that is what buyers type into a search box.

${spec.name} does not work that way.

WHO IS BUYING
${spec.audience}

WHAT ACTUALLY RANKS
${spec.algorithm}

RULES FOR THIS MARKETPLACE
${spec.rules}

FIELD LIMITS — these are hard limits, not suggestions:
${spec.hasTitle ? `- Title: at most ${spec.titleLimit} characters.` : "- There is NO title field. Return an empty string for title."}
- Description: at most ${spec.descriptionLimit} characters.
${spec.hashtagLimit > 0 ? `- Hashtags: at most ${spec.hashtagLimit}.` : "- There is NO hashtag field. Return an empty array."}
- Condition must be exactly one of: ${spec.conditions.join(", ")}
${spec.requiresMeasurements ? "- Measurements are expected on this marketplace and their absence costs sales." : "- Measurements are optional here; include them only if the source listing has them."}

PRICING
${spec.name} charges sellers ${spec.feePct === 0 ? "no fee" : `about ${spec.feePct}%`}. The item is asking $${ebayPrice} on eBay. Early engagement drives ranking on this marketplace, and price drives early engagement, so price at or below the eBay ask — never above.

WHAT CARRIES OVER UNCHANGED
Honesty. State visible flaws plainly — wear, stains, pilling, fading, missing buttons. Buyers on every one of these platforms leave bad reviews over undisclosed condition, and hiding a flaw costs more than it gains. Keep it matter-of-fact rather than apologetic.

Stay within the facts of the source listing. Never invent a brand, size, material, measurement or era that isn't in it. If the source doesn't establish something, leave that field empty rather than guessing.`;
}

/** Rewrite `listing` for `marketplace`, using the eBay copy as the facts. */
export async function generateMarketplaceDraft(
  userId: string,
  listing: Listing,
  marketplace: MarketplaceId
): Promise<MarketplaceDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("The Brain needs ANTHROPIC_API_KEY set in .env.local");
  }
  const spec = MARKETPLACES[marketplace];

  const settings = await getSellerSettings(userId);
  const playbook = await getPlaybook(userId);

  const system =
    buildPrompt(spec, listing.price) +
    (settings.niche.trim() ? `\n\nThe seller sells: ${settings.niche}` : "") +
    (playbook
      ? `\n\nWhat has worked for this seller (apply where it doesn't conflict with how ${spec.name} works):\n${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}`
      : "");

  const specifics = (listing.itemSpecifics ?? []).map((s) => `${s.name}: ${s.value}`).join("\n");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: [
          `Rewrite this eBay listing for ${spec.name}.`,
          `eBay title: ${listing.title}`,
          `eBay description:\n${listing.description}`,
          `eBay asking price: $${listing.price}`,
          `Category: ${listing.category}`,
          `Condition: ${listing.condition}`,
          specifics ? `Item specifics:\n${specifics}` : "",
          listing.tags.length ? `eBay keywords: ${listing.tags.join(", ")}` : "",
          listing.retail
            ? `Retail context: ${listing.retail.productName}, sold new around $${listing.retail.retailPrice}. ${listing.retail.desirability}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    output_config: { format: zodOutputFormat(DraftSchema) },
  });

  if (!response.parsed_output) throw new Error(`${spec.name} rewrite returned no structured output`);
  const out = response.parsed_output;

  // Enforce the platform's limits here rather than trusting the model to count.
  // An overrun description is silently truncated at paste time, which would cut
  // off the flaw disclosure that sits at the end of it.
  return {
    ...out,
    title: spec.hasTitle ? out.title.slice(0, spec.titleLimit) : "",
    description: out.description.slice(0, spec.descriptionLimit),
    hashtags:
      spec.hashtagLimit === 0
        ? []
        : out.hashtags
            .map((h) => h.replace(/^#/, "").trim().toLowerCase())
            .filter(Boolean)
            .slice(0, spec.hashtagLimit),
    // Keep the model honest about the condition picker: anything not on the
    // list would send the seller looking for an option that isn't there.
    condition: spec.conditions.includes(out.condition) ? out.condition : spec.conditions[0],
    photoPlan: out.photoPlan.slice(0, 5),
  };
}

/**
 * The description exactly as it should be pasted.
 *
 * Where a platform has a tag field, tags are also indexed inside the
 * description and sellers routinely put them in both, so rendering them
 * together gives one paste that works either way.
 */
export function renderDescription(draft: MarketplaceDraft): string {
  if (draft.hashtags.length === 0) return draft.description;
  const tags = draft.hashtags.map((h) => `#${h}`).join(" ");
  return `${draft.description}\n\n${tags}`;
}
