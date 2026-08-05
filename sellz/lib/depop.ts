import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getPlaybook, getSellerSettings, type Listing } from "./store";

/**
 * Depop listings are not eBay listings with different formatting. The two
 * marketplaces rank items on nearly opposite signals, so the same item needs
 * two separately written drafts rather than one draft copied twice.
 *
 * eBay (Cassini) ranks on keyword match against a long structured title,
 * completeness of item specifics, and conversion rate. It rewards an
 * exhaustive, literal title — "Carhartt Detroit Jacket Mens Large Brown Duck
 * Canvas Blanket Lined J97" — because that is what buyers type into a search
 * box and Cassini matches it term by term.
 *
 * Depop has no title field at all. Discovery happens in a visual feed and
 * through hashtags, so ranking leans on recency, engagement (likes and saves
 * per impression), hashtag relevance, and how good the first photo looks at
 * thumbnail size. A keyword-stuffed eBay title pasted into a Depop
 * description reads as spam to the audience and earns no engagement, which is
 * the signal Depop actually ranks on.
 *
 * Hence a separate prompt, a separate schema shaped like Depop's real compose
 * form, and a separate rendered copy block.
 */

/** Depop's condition picker offers exactly these, so the model must pick one. */
export const DEPOP_CONDITIONS = [
  "Brand new",
  "Like new",
  "Excellent",
  "Good",
  "Fair",
] as const;

/** Depop's "Source" field — it feeds the vintage//handmade browse filters. */
export const DEPOP_SOURCES = [
  "Vintage",
  "Thrifted",
  "Handmade",
  "Retail",
  "Own brand",
] as const;

/**
 * Depop caps the tag field at 5. Asking for more produces a list the seller
 * has to prune by hand at paste time, which is exactly the friction this
 * feature exists to remove.
 */
export const DEPOP_HASHTAG_LIMIT = 5;

/** Depop truncates descriptions at 1000 characters. */
export const DEPOP_DESCRIPTION_LIMIT = 1000;

const DepopDraftSchema = z.object({
  description: z
    .string()
    .describe(
      "The Depop description, at most 1000 characters. First line is a short human name for the item (brand + item + size) — Depop has no title field, so this line does the job in the feed. Then two or three short lines on fit, styling and vibe. Then flaws stated plainly. Lower case, conversational, no keyword stuffing, no ALL CAPS."
    ),
  hashtags: z
    .array(z.string())
    .describe(
      "At most 5 hashtags, without the # symbol, lower case, no spaces. Mix one brand tag, one garment tag, and two or three aesthetic/trend tags people actually browse (y2k, grunge, streetwear, cottagecore, workwear). These are the searchable field on Depop — they matter more than any word in the description."
    ),
  brand: z.string().describe("Brand for Depop's brand field, or empty string if unbranded"),
  size: z.string().describe("Size as printed on the tag, e.g. 'M', 'W30', 'UK 10'"),
  category: z.string().describe("Depop top-level category, e.g. 'Menswear', 'Womenswear'"),
  subcategory: z.string().describe("Depop subcategory, e.g. 'Jackets', 'Jeans', 'T-shirts'"),
  condition: z.enum(DEPOP_CONDITIONS).describe("Depop's condition picker value"),
  colour: z.string().describe("Main colour, single word where possible"),
  source: z.enum(DEPOP_SOURCES).describe("Depop's source field"),
  age: z
    .string()
    .describe("Decade if it reads as period-specific, e.g. '1990s', else empty string"),
  price: z
    .number()
    .describe(
      "Asking price in dollars for Depop specifically. Depop skews younger and more price-sensitive than eBay, and early engagement drives feed ranking, so this is usually at or slightly below the eBay ask — never above it."
    ),
  priceNote: z.string().describe("One sentence on why this price, versus the eBay ask"),
  photoPlan: z
    .array(z.string())
    .describe(
      "3-5 specific shots to take for this item, in order, first shot first. Depop is a visual feed — the first photo carries the listing. Prefer modelled or hung shots and flat-lays on a plain background in daylight over the plain catalogue shots eBay rewards. Be specific to THIS item."
    ),
  vibe: z
    .string()
    .describe("The aesthetic this item sits in, two or three words, e.g. '90s workwear'"),
});

export type DepopDraft = z.infer<typeof DepopDraftSchema>;

const DEPOP_PROMPT = `You rewrite an existing eBay listing as a Depop listing. These are different jobs, and a good eBay listing makes a bad Depop listing.

How Depop actually ranks and sells, and what it means for you:

1. THERE IS NO TITLE FIELD. Depop shows a photo and a price in the feed. The first line of your description is the closest thing to a title, so it should read like a person naming the item to a friend — "carhartt detroit jacket / large" — not like an eBay search string. Never produce a keyword-stuffed line.

2. HASHTAGS ARE THE SEARCH INDEX. Depop allows 5. They carry the discovery weight that an eBay title carries on Cassini. Spend them well: one brand, one garment type, and two or three aesthetic tags people actually browse (#y2k #grunge #streetwear #workwear #vintage). An unbranded item should spend all five on garment and aesthetic.

3. ENGAGEMENT AND RECENCY RANK, NOT KEYWORD MATCH. Likes and saves in the first hours decide how far a listing travels. That means the copy has to make someone want the item, not merely find it. Write short, lower case, conversational. Aesthetic and styling language beats specification. No ALL CAPS, no "L@@K", no bullet lists of specs.

4. PHOTOS OUTRANK EVERYTHING. Depop is a visual feed and the first photo does most of the work. Recommend modelled shots, flat-lays on plain backgrounds, and natural light. This is the opposite of eBay's plain white-background catalogue shot.

5. PRICE COMPETITIVENESS FEEDS THE ALGORITHM. Early engagement is what ranks a listing, and price drives early engagement. Depop's audience is younger and more price-sensitive than eBay's. Price at or slightly below the eBay ask, never above.

What carries over from the eBay listing unchanged: honesty. State visible flaws plainly — measurements, stains, wear, missing buttons. Depop buyers are quick to leave bad reviews over undisclosed condition, and hiding a flaw costs more than it gains. Keep it short and matter-of-fact rather than apologetic.

Stay within the facts of the source listing. Do not invent a brand, size, material or era that isn't in it. If the source listing doesn't establish something, leave that field empty rather than guessing.

Write in lower case throughout the description, which is the register of the platform. Proper nouns and brand names keep their capitals.`;

/**
 * Rewrite a listing for Depop. Takes the already-generated eBay listing as the
 * source of facts, so the two drafts never disagree about what the item is.
 */
export async function generateDepopDraft(
  userId: string,
  listing: Listing
): Promise<DepopDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("The Brain needs ANTHROPIC_API_KEY set in .env.local");
  }

  const settings = await getSellerSettings(userId);
  const playbook = await getPlaybook(userId);

  const system =
    DEPOP_PROMPT +
    (settings.niche.trim() ? `\n\nThe seller sells: ${settings.niche}` : "") +
    (playbook
      ? `\n\nWhat has actually worked for this seller (apply it where it doesn't conflict with how Depop works):\n${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}`
      : "");

  const specifics = (listing.itemSpecifics ?? [])
    .map((s) => `${s.name}: ${s.value}`)
    .join("\n");

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
          "Rewrite this eBay listing for Depop.",
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
    output_config: { format: zodOutputFormat(DepopDraftSchema) },
  });

  if (!response.parsed_output) throw new Error("Depop rewrite returned no structured output");

  const out = response.parsed_output;
  return {
    ...out,
    // Enforce Depop's real limits here rather than trusting the model to
    // count — a description that overruns is silently truncated by Depop at
    // paste time, which would cut off the flaw disclosure at the end.
    description: out.description.slice(0, DEPOP_DESCRIPTION_LIMIT),
    hashtags: out.hashtags
      .map((h) => h.replace(/^#/, "").trim().toLowerCase())
      .filter(Boolean)
      .slice(0, DEPOP_HASHTAG_LIMIT),
    photoPlan: out.photoPlan.slice(0, 5),
  };
}

/**
 * The description exactly as it should be pasted into Depop: body text, then
 * the hashtags on their own line.
 *
 * Depop's tag field and its description are separate inputs, but hashtags
 * written into the description are also indexed, and sellers routinely put
 * them in both. Rendering them together gives a single paste that works
 * whichever way the seller fills the form.
 */
export function renderDepopDescription(draft: DepopDraft): string {
  const tags = draft.hashtags.map((h) => `#${h}`).join(" ");
  return tags ? `${draft.description}\n\n${tags}` : draft.description;
}

/**
 * Best times to post, as a hint rather than a schedule.
 *
 * Depop weights recency heavily, so a listing gets its best shot at the feed
 * in the hours just after posting — which makes spacing listings out across
 * the day strictly better than dumping ten at once, where nine of them
 * compete with the first for the same window.
 */
export const DEPOP_POSTING_ADVICE = {
  windows: ["12pm – 2pm", "5pm – 7pm", "8pm – 10pm"],
  note: "Depop ranks fresh listings, so each one gets its best run in the hours right after it goes up. Posting a batch all at once wastes that — space them a few hours apart and you get several first-run windows instead of one.",
} as const;
