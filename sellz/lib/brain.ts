import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  daysListed,
  getListing,
  getPlaybook,
  getSellerSettings,
  listListings,
  listSeedListings,
  setPlaybook,
  trafficTrend,
  updateListing,
  type ActionCard,
  type BrainScore,
  type Comps,
  type Diagnosis,
  type ItemSpecific,
  type Listing,
  type Playbook,
} from "./store";

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("The Brain needs ANTHROPIC_API_KEY set in .env.local");
  }
}

async function sellerContext(userId: string): Promise<string> {
  const s = await getSellerSettings(userId);
  if (!s.niche.trim()) return "";
  return `\n\nThe seller:\nSells: ${s.niche}\nPlatforms: ${s.platforms}\nShipping: ${s.shipping || "(not set)"}\nShop style: ${s.style}`;
}

function listingRow(l: Listing, rank?: number): string {
  const o = l.outcome;
  const days = daysListed(l);
  return [
    rank !== undefined ? `#${rank}` : "",
    `status=${l.status} platform=${l.platform}`,
    `experiment=${l.experimentId ?? "control"}`,
    `ask=$${l.price}` +
      (o?.soldPrice !== undefined ? ` sold=$${o.soldPrice}` : "") +
      (days !== null ? ` days=${days}` : ""),
    o ? `views=${o.views} watchers=${o.watchers} offers=${o.offers}` : "(no traffic data)",
    `title="${l.title}"`,
    `category="${l.category}" condition="${l.condition}"`,
    l.tags.length ? `tags=${l.tags.join(",")}` : "",
    `desc="${l.description.slice(0, 150).replace(/\n/g, " ")}"`,
    // Photo count first, and always stated. It used to send only photosNote,
    // which is empty on listings synced from eBay — so every one of them
    // looked like it had no photos and got told to add some it already has.
    `photo_count=${l.photos?.length || l.imageUrls?.length || 0}`,
    l.photosNote ? `photo_notes="${l.photosNote.slice(0, 100).replace(/\n/g, " ")}"` : "",
    l.comps?.summary ? `comps="${l.comps.summary.slice(0, 100).replace(/\n/g, " ")}"` : "",
    l.itemSpecifics?.length
      ? `specifics=${l.itemSpecifics.map((s) => `${s.name}=${s.value}`).join(",")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

// ---------------------------------------------------------------------------
// Analyze: sold vs unsold -> playbook + experiment verdicts + new tests
// ---------------------------------------------------------------------------

const PlaybookSchema = z.object({
  summary: z
    .string()
    .describe("2-3 sentence plain-language summary: why the sales sold, why the stuck items are stuck"),
  listingGuidelines: z
    .string()
    .describe(
      "Concrete guidance for the next listings: title/keyword patterns, description structure, photo choices — based on what sold"
    ),
  pricingGuidelines: z
    .string()
    .describe("Pricing patterns that sold: where to price vs comps, when to take offers, auction vs fixed"),
  avoid: z.string().describe("Patterns shared by the unsold/stale listings"),
  experimentResults: z
    .string()
    .describe(
      "Verdicts on the experiments that were running: which variant sold better/faster than control, with the numbers — or 'not enough data yet' per experiment"
    ),
  experiments: z
    .array(
      z.object({
        hypothesis: z.string().describe("What is being tested and why, one sentence"),
        instruction: z
          .string()
          .describe(
            "A concrete instruction applied verbatim when generating variant listings, e.g. 'Lead the title with the brand and size'"
          ),
      })
    )
    .describe("Up to 3 NEW experiments to run next. Fewer is fine."),
});

const ANALYZE_PROMPT = `You are the performance brain of a marketplace selling tool (eBay, Depop and similar). You get the seller's listings — SOLD ones (with sale price, days-to-sell, views/watchers) and UNSOLD/stale ones — plus optionally reference listings (other sellers' successes; niche patterns, not this seller's data). Some listings are tagged with the experiment variant they tested vs "experiment=control".

Do three things:
1. Contrast the sold listings against the stuck ones. What did the sales share — title keywords, pricing vs comps, categories, condition framing, photos, timing? What do the stuck items share? Turn it into short, concrete guidelines (listing + pricing separately). Selling fast at a good price beats selling slow; a sale far under ask is a pricing lesson, not a win. The seller's own outcomes always outweigh references. With no own data, build the starter playbook from references and say so.
2. Judge the running experiments honestly: compare variants against control on sold-rate and days-to-sell. Declare winners with the numbers, or "not enough data yet".
3. Propose up to 3 new single-variable experiments worth testing next (title styles, pricing strategies, photo approaches). Fold confirmed winners into the guidelines instead of re-testing.

Be honest about sample size. Never invent patterns the data doesn't show.`;

export async function analyzePerformance(userId: string): Promise<Playbook> {
  requireKey();
  const informative = (await listListings(userId)).filter(
    (l) => l.status === "sold" || ((l.status === "active" || l.status === "stale" || l.status === "ended") && l.outcome)
  );
  const seeds = await listSeedListings(userId);
  if (informative.length < 3 && seeds.length < 3) {
    throw new Error(
      `Need either 3+ listings with outcomes — sold or stuck (have ${informative.length}) — or 3+ reference listings fed to the Brain (have ${seeds.length}).`
    );
  }

  const previous = await getPlaybook(userId);
  const rows = informative
    .sort((a, b) => (b.status === "sold" ? 1 : 0) - (a.status === "sold" ? 1 : 0))
    .map((l, i) => listingRow(l, i + 1))
    .join("\n");

  const ownContext = informative.length
    ? `The seller's listings, sold first:\n\n${rows}`
    : "The seller has no listing outcomes yet — build the starter playbook from the references.";

  const seedContext = seeds.length
    ? `\n\nReference successful listings to emulate:\n${seeds
        .map(
          (s, i) =>
            `ref#${i + 1}: ${s.description.slice(0, 300).replace(/\n/g, " ")}${s.stats ? ` | stats: ${s.stats.slice(0, 80)}` : ""}`
        )
        .join("\n")}`
    : "";

  const experimentContext = previous?.experiments?.length
    ? `\n\nExperiments that were running (listings tagged with these ids):\n${previous.experiments
        .map((e) => `${e.id}: ${e.hypothesis} — variant instruction: "${e.instruction}"`)
        .join("\n")}`
    : "\n\nNo experiments were running yet — propose the first ones.";

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: ANALYZE_PROMPT + (await sellerContext(userId)),
    messages: [
      { role: "user", content: `${ownContext}${seedContext}${experimentContext}` },
    ],
    output_config: { format: zodOutputFormat(PlaybookSchema) },
  });

  if (!response.parsed_output) throw new Error("Analysis returned no structured output");

  const { experiments, ...rest } = response.parsed_output;
  const playbook: Playbook = {
    ...rest,
    experiments: experiments.slice(0, 3).map((e) => ({
      ...e,
      id: `exp-${crypto.randomUUID().slice(0, 6)}`,
    })),
    updatedAt: new Date().toISOString(),
  };
  playbook.actionCards = await suggestActionCards(playbook, await listListings(userId)).catch(() => []);
  await setPlaybook(userId, playbook);
  return playbook;
}

// ---------------------------------------------------------------------------
// Action cards: turn playbook prose into "apply to N listings" buttons
// ---------------------------------------------------------------------------

const ActionCardSchema = z.object({
  cards: z
    .array(
      z.object({
        insight: z
          .string()
          .describe(
            "One sentence, concrete and specific, e.g. 'Nike listings sell twice as fast when the title leads with the model name.'"
          ),
        action: z
          .enum(["retitle", "reprice", "rewrite", "relist"])
          .describe("The kind of change that would apply this insight"),
        matchingIds: z
          .array(z.string())
          .describe(
            "IDs copied exactly from the roster below that this insight applies to. Never invent an id that wasn't given."
          ),
      })
    )
    .describe(
      "Up to 4 patterns from the playbook specific enough to point at real listings by id. Skip anything too vague to act on directly."
    ),
});

const ACTION_CARD_PROMPT = `You turn a seller's playbook into a short list of concrete actions tied to their actual current listings, not just prose they'll read once and forget. Given the playbook and a roster of their live/stale listings (id, title, category, price, tags), find up to 4 patterns specific enough to act on right now — a brand or category that shares a fixable problem, a pricing pattern that applies to a identifiable group. For each, list exactly which listing ids (from the roster given, verbatim) it applies to. If a playbook guideline is too generic to tie to specific listings, leave it out rather than forcing a match.`;

/**
 * Cross-references the playbook against the current listing roster so the
 * Brain page can show "Apply to 12 Nike listings" instead of a paragraph the
 * seller has to remember to act on manually. Matching ids are validated
 * against the roster actually given — a hallucinated id would otherwise
 * silently no-op when the seller clicks apply.
 */
export async function suggestActionCards(
  playbook: Playbook,
  listings: Listing[]
): Promise<ActionCard[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const roster = listings.filter((l) => l.status === "active" || l.status === "stale").slice(0, 80);
  if (roster.length === 0) return [];

  const rosterText = roster
    .map((l) => `${l.id}: "${l.title.slice(0, 80)}" | ${l.category || "uncategorized"} | $${l.price} | tags=${l.tags.join(",") || "none"}`)
    .join("\n");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: ACTION_CARD_PROMPT,
    messages: [
      {
        role: "user",
        content: `Playbook:\nListing guidelines: ${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}\nAvoid: ${playbook.avoid}\n\nCurrent roster (${roster.length} listings):\n${rosterText}`,
      },
    ],
    output_config: { format: zodOutputFormat(ActionCardSchema) },
  });

  if (!response.parsed_output) return [];
  const validIds = new Set(roster.map((l) => l.id));
  return response.parsed_output.cards
    .map((c) => ({
      insight: c.insight,
      action: c.action,
      matchListingIds: c.matchingIds.filter((id) => validIds.has(id)),
    }))
    .filter((c) => c.matchListingIds.length > 0)
    .slice(0, 4);
}

// ---------------------------------------------------------------------------
// Comps: web-search what similar items actually sell for
// ---------------------------------------------------------------------------

const CompsSchema = z.object({
  summary: z
    .string()
    .describe("2-3 sentences: what comparable items sell for and how fast, with specifics found"),
  priceLow: z.number().describe("Low end of the realistic sold-price range in dollars"),
  priceHigh: z.number().describe("High end of the realistic sold-price range in dollars"),
  demandNotes: z
    .string()
    .describe("Demand signals: how many comparables found, seasonality, what versions/conditions command premiums"),
});

const COMPS_PROMPT = `You research market comparables for a marketplace seller. Search the web for what items like the one described actually sell for (sold/completed prices where findable — price guides, marketplace searches, community posts about recent sales; asking prices only as a weak fallback, labeled as such). Then report a realistic sold-price range and demand picture. Be specific about what you found and honest about what you couldn't find — never fabricate prices or sales.`;

export async function researchComps(userId: string, listingId: string): Promise<Comps> {
  requireKey();
  const listing = await getListing(userId, listingId);
  if (!listing) throw new Error("Listing not found");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: COMPS_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: `Research comparables for this item:\nTitle: ${listing.title}\nCategory: ${listing.category}\nCondition: ${listing.condition}\nDescription: ${listing.description.slice(0, 400)}\nCurrently asking: $${listing.price} on ${listing.platform}`,
      },
    ],
    output_config: { format: zodOutputFormat(CompsSchema) },
  });

  if (!response.parsed_output) throw new Error("Comps research returned no structured output");

  // Collect cited source URLs from web search result blocks
  const sources: string[] = [];
  for (const block of response.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result" && r.url && sources.length < 5) {
          sources.push(r.url);
        }
      }
    }
  }

  const comps: Comps = {
    ...response.parsed_output,
    sources,
    manualNotes: listing.comps?.manualNotes,
    at: new Date().toISOString(),
  };
  await updateListing(userId, listingId, { comps });
  return comps;
}

// ---------------------------------------------------------------------------
// Score: grade a listing with a per-dimension breakdown
// ---------------------------------------------------------------------------

const ScoreBreakdownSchema = z.object({
  overall: z.number().describe("Predicted sell-ability 0-100 relative to this seller's listings"),
  breakdown: z
    .array(
      z.object({
        dimension: z
          .enum([
            "title_keywords",
            "item_specifics",
            "price_vs_comps",
            "description_trust",
            "condition_clarity",
            "photo_coverage",
            "category_fit",
          ])
          .describe("Which listing quality dimension this covers"),
        score: z.number().describe("0-100 for this dimension"),
        detail: z.string().describe("One sentence: what's strong or what to fix"),
      })
    )
    .describe("Score for each of the 7 quality dimensions"),
  topFix: z.string().describe("The single highest-impact change to improve it, one sentence"),
});

const SCORE_PROMPT = `You are the performance brain of a marketplace selling tool. Rate how likely a listing is to sell at its ask within a reasonable time, scoring it across 7 dimensions (0-100 each, 50 = typical for this seller).

Dimensions to score:
1. **title_keywords**: Would a buyer's search terms find this? Brand, model, size, color, key attribute. eBay titles ≤80 chars, no filler.
2. **item_specifics**: Are structured item specifics (brand, size, color, material, style) filled in? eBay ranks listings with complete specifics dramatically higher in search and filtered results.
3. **price_vs_comps**: Is the price competitive against comparable listings? Price at or slightly below similar items from well-rated sellers.
4. **description_trust**: Does the description build buyer trust? Materials, measurements, flaws stated plainly.
5. **condition_clarity**: Is condition stated honestly and specifically? Vague "good condition" scores lower than specific flaw disclosure.
6. **photo_coverage**: Are there enough photos from enough angles? eBay allows 12 free photos — more photos = more trust.
7. **category_fit**: Is the item in the right category? Wrong category = invisible to filtered searches.

The overall score is the weighted average leaning toward the weakest dimensions — one terrible dimension drags the listing down more than one great dimension lifts it.

If a playbook is provided, weigh it heavily — it's learned from their real sales. If comps are provided, weigh price against them hard. If the listing is part of an experiment, it deliberately deviates in that one way; don't penalize the deviation being tested. Be a tough, honest judge.`;

export async function scoreListing(userId: string, listingId: string): Promise<BrainScore | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const listing = await getListing(userId, listingId);
  if (!listing) return null;

  const playbook = await getPlaybook(userId);
  const experiment = playbook?.experiments?.find((e) => e.id === listing.experimentId);
  const system =
    SCORE_PROMPT +
    (await sellerContext(userId)) +
    (playbook
      ? `\n\nSeller playbook (from their real sales):\n${playbook.summary}\nListings: ${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}\nAvoid: ${playbook.avoid}`
      : "\n\nNo playbook exists yet — judge on general marketplace instincts and say so in the reason.");

  const compsText = listing.comps
    ? `\nComps: ${listing.comps.summary} Range $${listing.comps.priceLow}-$${listing.comps.priceHigh}. ${listing.comps.demandNotes}${listing.comps.manualNotes ? ` Seller notes: ${listing.comps.manualNotes}` : ""}`
    : listing.comps === undefined && "";

  const specificsText = listing.itemSpecifics?.length
    ? `\nItem specifics filled: ${listing.itemSpecifics.map((s) => `${s.name}=${s.value}`).join(", ")}`
    : "\nNo item specifics filled.";

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: `Listing to rate:\n${listingRow(listing)}${compsText || ""}${specificsText}${
          experiment
            ? `\nExperiment variant: ${experiment.hypothesis} (instruction: "${experiment.instruction}")`
            : ""
        }`,
      },
    ],
    output_config: { format: zodOutputFormat(ScoreBreakdownSchema) },
  });

  if (!response.parsed_output) return null;
  const out = response.parsed_output;
  const overall = Math.max(0, Math.min(100, Math.round(out.overall)));
  const breakdown = out.breakdown.map((d) => ({
    ...d,
    score: Math.max(0, Math.min(100, Math.round(d.score))),
  }));
  const brainScore: BrainScore = {
    score: overall,
    reason: `Fix: ${out.topFix}`,
    breakdown,
    at: new Date().toISOString(),
  };
  await updateListing(userId, listingId, { brainScore });
  return brainScore;
}

// ---------------------------------------------------------------------------
// Diagnose: why isn't this selling + rewrite
// ---------------------------------------------------------------------------

const DiagnosisSchema = z.object({
  text: z
    .string()
    .describe("Why this listing isn't selling, 2-4 sentences, ranked by likely impact"),
  rewrittenTitle: z.string().describe("Improved title, platform-appropriate"),
  rewrittenDescription: z.string().describe("Improved description, ready to paste"),
  suggestedPrice: z.number().describe("Suggested new price in dollars"),
});

const DIAGNOSE_PROMPT = `You are the performance brain of a marketplace selling tool. A listing isn't selling. Work out why — price vs comps, title searchability (would a buyer's search find it?), description gaps that kill trust, condition framing, photo plan — contrasted against what has worked in the seller's playbook and sold listings. Then rewrite it: title, description, and a suggested price. Platform matters: eBay titles are keyword-dense (≤80 chars, brand/model/size/condition); Depop is casual with hashtags. Never invent condition details, measurements, or provenance not in the original listing.`;

export async function diagnose(userId: string, listingId: string): Promise<Diagnosis> {
  requireKey();
  const listing = await getListing(userId, listingId);
  if (!listing) throw new Error("Listing not found");

  const playbook = await getPlaybook(userId);
  const soldExamples = (await listListings(userId))
    .filter((l) => l.status === "sold")
    .slice(0, 5)
    .map((l) => listingRow(l))
    .join("\n");

  const system =
    DIAGNOSE_PROMPT +
    (await sellerContext(userId)) +
    (playbook
      ? `\n\nSeller playbook:\n${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}\nAvoid: ${playbook.avoid}`
      : "");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: [
          `Stuck listing:\n${listingRow(listing)}`,
          listing.comps
            ? `Comps: ${listing.comps.summary} Range $${listing.comps.priceLow}-$${listing.comps.priceHigh}.${listing.comps.manualNotes ? ` Seller notes: ${listing.comps.manualNotes}` : ""}`
            : "",
          soldExamples ? `The seller's recent SOLD listings for contrast:\n${soldExamples}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    output_config: { format: zodOutputFormat(DiagnosisSchema) },
  });

  if (!response.parsed_output) throw new Error("Diagnosis returned no structured output");
  const diagnosis: Diagnosis = {
    ...response.parsed_output,
    at: new Date().toISOString(),
  };
  await updateListing(userId, listingId, { diagnosis });
  return diagnosis;
}

// ---------------------------------------------------------------------------
// Generate: new listings from an item description
// ---------------------------------------------------------------------------

const GenSchema = z.object({
  listings: z
    .array(
      z.object({
        title: z.string().describe("Platform-appropriate title"),
        description: z.string().describe("Full listing description, ready to paste"),
        price: z.number().describe("Suggested price in dollars"),
        category: z.string().describe("Marketplace category"),
        condition: z.string().describe("Condition statement based only on what the seller said"),
        tags: z.array(z.string()).describe("Search tags/hashtags, up to 8"),
        photosNote: z
          .string()
          .describe("Photo checklist: which shots to take to make this sell"),
      })
    )
    .describe("The requested number of listing variants"),
});

const GENERATE_PROMPT = `You are the listing writer of a marketplace selling tool. The seller describes a physical item; write ready-to-post listings for it. If a playbook is provided it's learned from their real sales — follow it hard. Platform matters: eBay titles are keyword-dense (≤80 chars: brand, model, size, color, condition — what buyers type into search); Depop titles/descriptions are casual with hashtags and style keywords. Descriptions build trust: materials, measurements, flaws stated plainly. Never invent brand names, sizes, measurements, condition details, or provenance the seller didn't state — if something important is unknown, write the listing without it and flag it in photosNote.`;

export interface GeneratedListing {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  tags: string[];
  photosNote: string;
}

export async function generateListings(
  userId: string,
  itemDescription: string,
  platform: "ebay" | "depop" | "other",
  count: number,
  experimentInstr?: string
): Promise<GeneratedListing[]> {
  requireKey();
  if (itemDescription.trim().length < 10) {
    throw new Error("Describe the item — brand, size, condition, flaws, anything a buyer asks");
  }
  const playbook = await getPlaybook(userId);
  const system =
    GENERATE_PROMPT +
    (await sellerContext(userId)) +
    (playbook
      ? `\n\nSeller playbook (from real sales — follow it):\n${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}\nAvoid: ${playbook.avoid}`
      : "");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: [
          `Write ${count} listing variant${count === 1 ? "" : "s"} for ${platform}.`,
          `The item: ${itemDescription.trim()}`,
          experimentInstr
            ? `This is an experiment variant — apply this instruction even where it conflicts with the playbook: ${experimentInstr}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(GenSchema) },
  });

  if (!response.parsed_output) throw new Error("Generation returned no structured output");
  return response.parsed_output.listings.slice(0, count).map((l) => ({
    ...l,
    tags: l.tags.slice(0, 8),
  }));
}

// ---------------------------------------------------------------------------
// Vision: identify an item from its photos and write the whole listing
// ---------------------------------------------------------------------------

const PhotoListingSchema = z.object({
  identified: z
    .string()
    .describe("What the item plainly is, e.g. 'Carhartt Detroit jacket, brown duck canvas'"),
  brand: z.string().describe("Brand if legible on the item or its tags, else empty string"),
  size: z.string().describe("Size if legible on a tag, else empty string"),
  title: z.string().describe("eBay title, <=80 chars, keyword-dense: brand, model, size, colour"),
  description: z.string().describe("Full listing description, ready to post"),
  price: z.number().describe("Suggested asking price in dollars"),
  category: z.string().describe("Plain-language category, e.g. 'Men's Jackets'"),
  condition: z
    .string()
    .describe("Condition based ONLY on what is visible in the photos, flaws included"),
  tags: z.array(z.string()).describe("Search keywords, up to 8"),
  visibleFlaws: z
    .string()
    .describe("Any wear, stains, holes, fading visible in the photos — empty string if none seen"),
  photosNote: z.string().describe("Any additional shots worth taking before listing"),
  confidence: z
    .number()
    .describe("0-100: how confident you are in the identification from these photos alone"),
  uncertainties: z
    .string()
    .describe("What you could NOT determine from the photos and the seller should confirm"),
  itemSpecifics: z
    .array(
      z.object({
        name: z
          .string()
          .describe("eBay aspect name, e.g. 'Brand', 'Size', 'Color', 'Material', 'Style', 'Pattern'"),
        value: z.string().describe("The value visible in the photos or stated by the seller"),
        source: z
          .enum(["photo", "tag", "seller", "inferred"])
          .describe(
            "Where this fact came from: 'tag' if read from a label, 'photo' if visible in the image, 'seller' if stated in notes, 'inferred' if deduced"
          ),
      })
    )
    .describe(
      "Every structured item specific you can extract: Brand, Size, Color, Material, Style, Pattern, Sleeve Length, Department, Type, Closure, Neckline, etc. eBay ranks listings with complete item specifics dramatically higher. Extract as many as you can from the photos and tags."
    ),
});

export type PhotoListing = z.infer<typeof PhotoListingSchema>;

const PHOTO_PROMPT = `You are the listing writer of a marketplace selling tool. You are shown photos of one physical item — typically the front and the back — and you write a complete, ready-to-post eBay listing for it.

Rules that matter:
- Describe ONLY what you can actually see. Never invent a brand, size, material, model year, or measurement that isn't legible in the photos. If a tag is unreadable, say so in "uncertainties" rather than guessing.
- Call out visible flaws honestly (wear, stains, pilling, scuffs, fading, missing buttons). Honest flaw disclosure is what stops returns and builds seller rating — it belongs in the description, not hidden.
- eBay titles are what buyers type into search: brand, model, size, colour, key attribute. <=80 characters, no filler words, no ALL CAPS.
- The description should build trust: what it is, condition stated plainly, flaws, and what the buyer receives.
- Set "confidence" honestly. A clear branded tag means high confidence; a generic unbranded item photographed dimly means low confidence, and you should say why in "uncertainties".
- ITEM SPECIFICS ARE CRITICAL. eBay's search algorithm (Cassini) ranks listings with complete item specifics dramatically higher. Buyers filter search results by these fields — a listing without "Brand" filled in is invisible to anyone who filters by brand. Extract every specific you can:
  - From tags/labels: Brand, Size, Material/Fabric, Care instructions, Country of manufacture
  - From visual inspection: Color, Pattern, Style, Sleeve Length, Closure type, Neckline, Fit type
  - Mark each with its source: "tag" for label text, "photo" for visible features, "inferred" for educated deductions, "seller" for seller-provided notes
  - When unsure, use source="inferred" and note the uncertainty. An inferred specific that the seller can confirm is better than a missing one.

If comparable sold items and a seller playbook are provided, price and phrase against them — they reflect what has actually sold.`;

/**
 * Generate a full listing from item photos. `images` are raw base64 payloads
 * with their media types, in the order the seller uploaded them.
 */
export async function generateFromPhotos(
  userId: string,
  images: { base64: string; mediaType: string }[],
  sellerNotes: string,
  compsContext?: string
): Promise<PhotoListing> {
  requireKey();
  if (images.length === 0) throw new Error("Add at least one photo of the item");

  const playbook = await getPlaybook(userId);
  const system =
    PHOTO_PROMPT +
    (await sellerContext(userId)) +
    (playbook
      ? `\n\nSeller playbook (learned from their real sales — follow it):\n${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}\nAvoid: ${playbook.avoid}`
      : "");

  const content: Anthropic.ContentBlockParam[] = images.map((img, i) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.mediaType as "image/jpeg", data: img.base64 },
    ...(i === 0 ? {} : {}),
  }));

  content.push({
    type: "text",
    text: [
      images.length > 1
        ? `The ${images.length} photos above show the same item (typically front, then back).`
        : "The photo above shows the item.",
      sellerNotes.trim()
        ? `The seller adds: ${sellerNotes.trim()}`
        : "The seller added no extra notes — work from the photos alone.",
      compsContext ?? "",
      "Write the eBay listing.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(PhotoListingSchema) },
  });

  if (!response.parsed_output) throw new Error("Photo analysis returned no structured output");
  return {
    ...response.parsed_output,
    tags: response.parsed_output.tags.slice(0, 8),
    itemSpecifics: response.parsed_output.itemSpecifics.slice(0, 30),
  };
}

// ---------------------------------------------------------------------------
// Aspect gap-fill: eBay requires specific fields per category (e.g. "Sleeve
// Length" for tops) that the first vision pass may not have thought to look
// for. Rather than guess at publish time, ask again, by name, before the
// seller ever sees the review screen.
// ---------------------------------------------------------------------------

const AspectFillSchema = z.object({
  found: z
    .array(
      z.object({
        name: z.string().describe("The exact eBay aspect name asked for"),
        value: z.string().describe("The value, determined from the photos"),
        confident: z.boolean().describe("True if clearly visible/legible, false if a best guess"),
      })
    )
    .describe("One entry per aspect you could determine — omit any you genuinely cannot tell"),
});

const ASPECT_FILL_PROMPT = `eBay requires specific item specifics for this listing's category that weren't extracted the first time. Look at the photos again and determine each one if you can. Only report a value when the photos actually support it — a confident guess is fine (mark confident=false), but do not invent brands, sizes, or materials with no visual basis. Skip any aspect you truly cannot determine from these photos.`;

/**
 * Second, narrower vision pass: given the specific eBay aspect names still
 * missing after the main listing was written, look at the same photos again
 * and try to answer just those. Cheaper and more likely to succeed than
 * re-running the whole listing generation, because the model isn't also
 * juggling title/description/price this time — it only has one job.
 */
export async function fillMissingAspects(
  images: { base64: string; mediaType: string }[],
  missingAspectNames: string[]
): Promise<ItemSpecific[]> {
  if (missingAspectNames.length === 0) return [];
  requireKey();

  const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.mediaType as "image/jpeg", data: img.base64 },
  }));
  content.push({
    type: "text",
    text: `eBay still needs: ${missingAspectNames.join(", ")}. Determine what you can from the photos above.`,
  });

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system: ASPECT_FILL_PROMPT,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(AspectFillSchema) },
  });

  if (!response.parsed_output) return [];
  return response.parsed_output.found.map((f) => ({
    name: f.name,
    value: f.value,
    source: f.confident ? ("photo" as const) : ("inferred" as const),
  }));
}

// ---------------------------------------------------------------------------
// Photo coach: instant feedback the moment a photo lands, before the full
// pipeline runs. Deliberately the fastest/cheapest model available — this
// only needs to catch "retake this" in a couple seconds, not write the
// listing.
// ---------------------------------------------------------------------------

const PhotoCheckSchema = z.object({
  quickId: z.string().describe("Best guess at what the item is, one short phrase"),
  qualityWarning: z
    .string()
    .describe("A specific problem worth retaking for (blur, too dark, too far away, cropped) — empty string if the photo is fine"),
  missingShots: z
    .array(z.string())
    .describe(
      "Concrete shots still worth taking given what's visible so far, e.g. 'the brand tag inside the collar', 'the back', 'a close-up of the stain near the hem'. Empty if nothing obvious is missing yet."
    ),
});

export type PhotoCheck = z.infer<typeof PhotoCheckSchema>;

const PHOTO_CHECK_PROMPT = `You give a marketplace seller instant feedback on a photo they just took, before they've finished shooting the item. Look fast: is the photo usable (in focus, close enough, well lit), and given only what you can see, what's an obvious next shot worth taking (the other side, a brand tag, a visible flaw up close)? Be brief and specific. Do not write a listing — this is a quick coaching check, not the analysis.`;

/**
 * Instant first-pass run the moment a photo is uploaded, before the seller
 * has finished shooting the item. Separate from generateFromPhotos: that call
 * does full identification + comps-aware listing writing and takes several
 * seconds per stage; this only needs to answer "is this shot good enough" and
 * "what's obviously missing" in near real time, so it runs on the fastest
 * model rather than the one doing the real analysis.
 */
export async function checkPhoto(
  image: { base64: string; mediaType: string },
  shotsSoFar: string[]
): Promise<PhotoCheck> {
  requireKey();
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: PHOTO_CHECK_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: image.mediaType as "image/jpeg", data: image.base64 },
          },
          {
            type: "text",
            text: shotsSoFar.length
              ? `Shots already taken: ${shotsSoFar.join(", ")}. This is the latest one.`
              : "This is the first photo taken of the item.",
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(PhotoCheckSchema) },
  });

  if (!response.parsed_output) throw new Error("Photo check returned no structured output");
  return {
    ...response.parsed_output,
    missingShots: response.parsed_output.missingShots.slice(0, 3),
  };
}

/** Round-robin a listing into "control" or an active experiment arm. */
export async function pickExperiment(userId: string): Promise<string> {
  const experiments = (await getPlaybook(userId))?.experiments ?? [];
  if (experiments.length === 0) return "control";
  const arms = ["control", ...experiments.map((e) => e.id)];
  const counts = new Map(arms.map((a) => [a, 0]));
  for (const l of await listListings(userId)) {
    if (l.experimentId && counts.has(l.experimentId)) {
      counts.set(l.experimentId, (counts.get(l.experimentId) ?? 0) + 1);
    }
  }
  return arms.reduce((least, arm) =>
    (counts.get(arm) ?? 0) < (counts.get(least) ?? 0) ? arm : least
  );
}

export async function experimentInstruction(userId: string, experimentId?: string): Promise<string | undefined> {
  if (!experimentId || experimentId === "control") return undefined;
  return (await getPlaybook(userId))?.experiments?.find((e) => e.id === experimentId)?.instruction;
}

// ---------------------------------------------------------------------------
// Proposals: what to change about a listing that is already live
// ---------------------------------------------------------------------------

const ProposalSchema = z.object({
  kind: z
    .enum(["reprice", "retitle", "rewrite", "relist", "hold"])
    .describe(
      "reprice = price is the blocker; retitle = buyers cannot find it; rewrite = description kills trust; relist = listing is stale and exhausted its exposure; hold = leave it alone, not enough evidence or it is performing fine"
    ),
  summary: z.string().describe("One short line the seller reads before deciding, plain language"),
  rationale: z
    .string()
    .describe(
      "Why, referencing the actual numbers: days live, views, watchers, and where the price sits against comps"
    ),
  proposedPrice: z
    .number()
    .describe("Suggested new price in dollars. Same as current price when kind is not reprice"),
  proposedTitle: z
    .string()
    .describe("Suggested new title, <=80 chars. Empty string when kind is not retitle"),
  proposedDescription: z
    .string()
    .describe("Suggested new description. Empty string when kind is not rewrite"),
  confidence: z
    .number()
    .describe("0-100. Be strict: low when traffic is too thin to conclude anything"),
});

export type ProposalDraft = z.infer<typeof ProposalSchema>;

const PROPOSE_PROMPT = `You review listings that are already live on eBay and decide whether to change anything.

Judge against the evidence, not vibes:
- Views with no watchers usually means the price is wrong, not the title.
- Almost no views usually means the title is not matching what buyers search.
- Watchers but no sale often means the price is close but slightly high, so a small cut or accepting offers moves it.
- A listing only a day or two old has not gathered enough signal. Say "hold" and be honest that it is too early.
- When a traffic trend is given, weigh direction over the raw snapshot: views declining over time means the listing is losing search position and a title rewrite is worth more than a price change; views flat-to-rising with watchers climbing but no sale means the price is close, not wrong — a small cut beats a rewrite; a fresh relist with a sudden view spike means whatever changed is working, so hold rather than change it again.

Be conservative. A wrong price cut costs the seller real money, and churning a listing that is simply young is worse than doing nothing. Only propose "relist" when a listing has been live a long time with poor traffic, since relisting loses accumulated watchers and can incur fees.

Comparable prices you are given are asking prices unless explicitly marked SOLD. Asking prices skew high because unsold listings sit at optimistic numbers forever, so do not price to match them; price below them unless the item is clearly better.`;

/** Decide what, if anything, should change about a live listing. */
export async function proposeListingChange(
  userId: string,
  listingId: string,
  compsContext: string,
  daysLive: number
): Promise<ProposalDraft | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const listing = await getListing(userId, listingId);
  if (!listing) return null;

  const playbook = await getPlaybook(userId);
  const system =
    PROPOSE_PROMPT +
    (await sellerContext(userId)) +
    (playbook
      ? `\n\nSeller playbook, learned from their real sales:\n${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}\nAvoid: ${playbook.avoid}`
      : "");

  const o = listing.outcome;
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
          `Live listing, ${daysLive} day${daysLive === 1 ? "" : "s"} on site:`,
          listingRow(listing),
          o
            ? `Traffic so far: ${o.views} views, ${o.watchers} watchers, ${o.offers} offers.`
            : "No traffic data recorded yet.",
          (() => {
            const trend = trafficTrend(o?.trafficHistory);
            return trend ? `Traffic trend: ${trend}.` : "";
          })(),
          compsContext || "No comparable listings were found for this item.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(ProposalSchema) },
  });

  if (!response.parsed_output) return null;
  return response.parsed_output;
}

// ---------------------------------------------------------------------------
// Retail research: what the item cost new, and what it is actually called
// ---------------------------------------------------------------------------

const RetailSchema = z.object({
  productName: z.string().describe("The specific product name, as the maker would call it"),
  retailPrice: z
    .number()
    .describe("Original retail price in dollars, 0 if it genuinely cannot be established"),
  retailPriceNote: z
    .string()
    .describe("Where that figure came from, or plainly that it could not be found"),
  releaseEra: z.string().describe("Roughly when it was sold new, empty string if unknown"),
  desirability: z
    .string()
    .describe("2-3 sentences on collector or resale demand and what drives it for this item"),
  sellingPoints: z
    .array(z.string())
    .describe("Up to 4 specific facts worth putting in a listing, e.g. materials, provenance"),
});

export type RetailResearch = z.infer<typeof RetailSchema>;

const RETAIL_PROMPT = `You research what a second-hand item originally sold for at retail and why buyers want it. Search the web for the specific product. Report the original retail price only when you can actually establish it, and say plainly when you cannot rather than estimating a number that looks authoritative. Never invent prices, release dates, or provenance.`;

/**
 * Retail-side context for an item: what it cost new, what it is really
 * called, and why anyone wants it. Complements eBay comps, which only ever
 * show the resale side.
 */
export async function researchRetail(
  itemDescription: string,
  compTitles: string[]
): Promise<RetailResearch> {
  requireKey();
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    system: RETAIL_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: [
          `Item: ${itemDescription}`,
          compTitles.length
            ? `eBay matched these visually similar listings, which is strong evidence of what it is:\n${compTitles.slice(0, 8).map((t) => `- ${t}`).join("\n")}`
            : "",
          "What did this sell for new, and why do buyers want it?",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    output_config: { format: zodOutputFormat(RetailSchema) },
  });

  if (!response.parsed_output) throw new Error("Retail research returned no structured output");
  return { ...response.parsed_output, sellingPoints: response.parsed_output.sellingPoints.slice(0, 4) };
}
