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
  updateListing,
  type BrainScore,
  type Comps,
  type Diagnosis,
  type Listing,
  type Playbook,
} from "./store";

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("The Brain needs ANTHROPIC_API_KEY set in .env.local");
  }
}

function sellerContext(): string {
  const s = getSellerSettings();
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
    l.photosNote ? `photos="${l.photosNote.slice(0, 100).replace(/\n/g, " ")}"` : "",
    l.comps?.summary ? `comps="${l.comps.summary.slice(0, 100).replace(/\n/g, " ")}"` : "",
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

export async function analyzePerformance(): Promise<Playbook> {
  requireKey();
  const informative = listListings().filter(
    (l) => l.status === "sold" || ((l.status === "active" || l.status === "stale" || l.status === "ended") && l.outcome)
  );
  const seeds = listSeedListings();
  if (informative.length < 3 && seeds.length < 3) {
    throw new Error(
      `Need either 3+ listings with outcomes — sold or stuck (have ${informative.length}) — or 3+ reference listings fed to the Brain (have ${seeds.length}).`
    );
  }

  const previous = getPlaybook();
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
    system: ANALYZE_PROMPT + sellerContext(),
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
  setPlaybook(playbook);
  return playbook;
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

export async function researchComps(listingId: string): Promise<Comps> {
  requireKey();
  const listing = getListing(listingId);
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
  updateListing(listingId, { comps });
  return comps;
}

// ---------------------------------------------------------------------------
// Score: grade a listing before it goes up
// ---------------------------------------------------------------------------

const ScoreSchema = z.object({
  score: z.number().describe("Predicted sell-ability 0-100 relative to this seller's listings"),
  reason: z.string().describe("One-sentence justification"),
  fix: z.string().describe("The single highest-impact change to improve it, one sentence"),
});

const SCORE_PROMPT = `You are the performance brain of a marketplace selling tool. Rate how likely a listing is to sell at its ask within a reasonable time, 0-100 (50 = typical for this seller). Judge title searchability, price vs comps, description trust, condition clarity, photo plan. If a playbook is provided, weigh it heavily — it's learned from their real sales. If comps are provided, weigh price against them hard. If the listing is part of an experiment, it deliberately deviates in that one way; don't penalize the deviation being tested. Be a tough, honest judge.`;

export async function scoreListing(listingId: string): Promise<BrainScore | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const listing = getListing(listingId);
  if (!listing) return null;

  const playbook = getPlaybook();
  const experiment = playbook?.experiments?.find((e) => e.id === listing.experimentId);
  const system =
    SCORE_PROMPT +
    sellerContext() +
    (playbook
      ? `\n\nSeller playbook (from their real sales):\n${playbook.summary}\nListings: ${playbook.listingGuidelines}\nPricing: ${playbook.pricingGuidelines}\nAvoid: ${playbook.avoid}`
      : "\n\nNo playbook exists yet — judge on general marketplace instincts and say so in the reason.");

  const compsText = listing.comps
    ? `\nComps: ${listing.comps.summary} Range $${listing.comps.priceLow}-$${listing.comps.priceHigh}. ${listing.comps.demandNotes}${listing.comps.manualNotes ? ` Seller notes: ${listing.comps.manualNotes}` : ""}`
    : listing.comps === undefined && "";

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: `Listing to rate:\n${listingRow(listing)}${compsText || ""}${
          experiment
            ? `\nExperiment variant: ${experiment.hypothesis} (instruction: "${experiment.instruction}")`
            : ""
        }`,
      },
    ],
    output_config: { format: zodOutputFormat(ScoreSchema) },
  });

  if (!response.parsed_output) return null;
  const brainScore: BrainScore = {
    score: Math.max(0, Math.min(100, Math.round(response.parsed_output.score))),
    reason: `${response.parsed_output.reason} Fix: ${response.parsed_output.fix}`,
    at: new Date().toISOString(),
  };
  updateListing(listingId, { brainScore });
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

export async function diagnose(listingId: string): Promise<Diagnosis> {
  requireKey();
  const listing = getListing(listingId);
  if (!listing) throw new Error("Listing not found");

  const playbook = getPlaybook();
  const soldExamples = listListings()
    .filter((l) => l.status === "sold")
    .slice(0, 5)
    .map((l) => listingRow(l))
    .join("\n");

  const system =
    DIAGNOSE_PROMPT +
    sellerContext() +
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
  updateListing(listingId, { diagnosis });
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
  itemDescription: string,
  platform: "ebay" | "depop" | "other",
  count: number,
  experimentInstr?: string
): Promise<GeneratedListing[]> {
  requireKey();
  if (itemDescription.trim().length < 10) {
    throw new Error("Describe the item — brand, size, condition, flaws, anything a buyer asks");
  }
  const playbook = getPlaybook();
  const system =
    GENERATE_PROMPT +
    sellerContext() +
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

/** Round-robin a listing into "control" or an active experiment arm. */
export function pickExperiment(): string {
  const experiments = getPlaybook()?.experiments ?? [];
  if (experiments.length === 0) return "control";
  const arms = ["control", ...experiments.map((e) => e.id)];
  const counts = new Map(arms.map((a) => [a, 0]));
  for (const l of listListings()) {
    if (l.experimentId && counts.has(l.experimentId)) {
      counts.set(l.experimentId, (counts.get(l.experimentId) ?? 0) + 1);
    }
  }
  return arms.reduce((least, arm) =>
    (counts.get(arm) ?? 0) < (counts.get(least) ?? 0) ? arm : least
  );
}

export function experimentInstruction(experimentId?: string): string | undefined {
  if (!experimentId || experimentId === "control") return undefined;
  return getPlaybook()?.experiments?.find((e) => e.id === experimentId)?.instruction;
}
