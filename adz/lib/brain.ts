import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  derived,
  getAd,
  getPlaybook,
  getProductSettings,
  listAds,
  listSeedAds,
  setPlaybook,
  updateAd,
  type Ad,
  type AdCreative,
  type BrainScore,
  type Playbook,
} from "./store";

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("The Brain needs ANTHROPIC_API_KEY set in .env.local");
  }
}

function productContext(): string {
  const p = getProductSettings();
  if (!p.product.trim()) return "";
  return `\n\nThe product being advertised:\nProduct: ${p.product}\nAudience: ${p.audience || "(not set)"}\nOffer: ${p.offer || "(not set)"}\nBrand voice: ${p.voice}`;
}

function adRow(a: Ad, rank?: number): string {
  const d = derived(a.metrics);
  const m = a.metrics;
  return [
    rank !== undefined ? `#${rank}` : "",
    `format=${a.format} platform=${a.platform}`,
    `experiment=${a.experimentId ?? "control"}`,
    m
      ? `impressions=${m.impressions} clicks=${m.clicks} spend=$${m.spend} purchases=${m.purchases} revenue=$${m.revenue}` +
        (d
          ? ` | CTR=${d.ctr?.toFixed(2) ?? "?"}% CVR=${d.cvr?.toFixed(2) ?? "?"}% ROAS=${d.roas?.toFixed(2) ?? "?"}`
          : "")
      : "(no metrics)",
    `headline="${a.creative.headline}"`,
    `text="${a.creative.primaryText.slice(0, 150).replace(/\n/g, " ")}"`,
    `cta="${a.creative.cta}"`,
    `visual="${a.creative.visualDescription.slice(0, 150).replace(/\n/g, " ")}"`,
  ]
    .filter(Boolean)
    .join(" | ");
}

// ---------------------------------------------------------------------------
// Analyze: real ad performance -> playbook + experiment verdicts + new tests
// ---------------------------------------------------------------------------

const PlaybookSchema = z.object({
  summary: z
    .string()
    .describe("2-3 sentence plain-language summary of what's converting and what isn't"),
  creativeGuidelines: z
    .string()
    .describe(
      "Concrete guidance for writing the next ads: angles, hook styles, offer framing, formats, lengths — based on what performed"
    ),
  visualGuidelines: z
    .string()
    .describe("Visual patterns that performed: composition, subjects, style, colors"),
  avoid: z.string().describe("Patterns that underperformed and should be avoided"),
  experimentResults: z
    .string()
    .describe(
      "Verdicts on the experiments that were running: which variant beat control, with the numbers — or 'not enough data yet' per experiment"
    ),
  experiments: z
    .array(
      z.object({
        hypothesis: z.string().describe("What is being tested and why, one sentence"),
        instruction: z
          .string()
          .describe(
            "A concrete instruction applied verbatim when generating variant ads, e.g. 'Open the primary text with a customer quote'"
          ),
      })
    )
    .describe("Up to 3 NEW experiments to run next. Fewer is fine."),
});

const ANALYZE_PROMPT = `You are the performance brain of an advertising tool. You may get two kinds of input: the advertiser's own ads with real metrics (impressions, clicks, spend, purchases, revenue — plus derived CTR/CVR/ROAS), and reference ads (other brands' winners the user wants to emulate; niche patterns, not this audience's data). Some ads are tagged with the experiment variant they tested vs "experiment=control".

Do three things:
1. Find real patterns — angles, hooks, offers, visuals, formats that correlate with CTR and especially with purchases/ROAS (clicks are cheap, conversions are the truth). Turn them into short, concrete guidelines for writing and designing the next ads. The advertiser's own numbers always outweigh references. With no own data, build the starter playbook from references and say so.
2. Judge the running experiments honestly: compare each variant against control on ROAS first, CTR second. Declare winners with the numbers, or "not enough data yet".
3. Propose up to 3 new single-variable experiments worth testing next. Fold confirmed winners into the guidelines instead of re-testing.

Be honest about sample size. Never invent patterns the data doesn't show.`;

export async function analyzePerformance(): Promise<Playbook> {
  requireKey();
  const rated = listAds().filter((a) => a.metrics && a.metrics.impressions > 0);
  const seeds = listSeedAds();
  if (rated.length < 3 && seeds.length < 3) {
    throw new Error(
      `Need either metrics on 3+ of your ads (have ${rated.length}) or 3+ reference ads fed to the Brain (have ${seeds.length}).`
    );
  }

  const previous = getPlaybook();
  const rows = rated
    .sort((a, b) => (derived(b.metrics)?.roas ?? 0) - (derived(a.metrics)?.roas ?? 0))
    .map((a, i) => adRow(a, i + 1))
    .join("\n");

  const ownContext = rated.length
    ? `The advertiser's ads, best ROAS first:\n\n${rows}`
    : "The advertiser has no rated ads of their own yet — build the starter playbook from the references.";

  const seedContext = seeds.length
    ? `\n\nReference winning ads to emulate:\n${seeds
        .map(
          (s, i) =>
            `ref#${i + 1}: ${s.description.slice(0, 300).replace(/\n/g, " ")}${s.stats ? ` | stats: ${s.stats.slice(0, 80)}` : ""}`
        )
        .join("\n")}`
    : "";

  const experimentContext = previous?.experiments?.length
    ? `\n\nExperiments that were running (ads tagged with these ids):\n${previous.experiments
        .map((e) => `${e.id}: ${e.hypothesis} — variant instruction: "${e.instruction}"`)
        .join("\n")}`
    : "\n\nNo experiments were running yet — propose the first ones.";

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: ANALYZE_PROMPT + productContext(),
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
// Score: predict an ad's performance before spending on it
// ---------------------------------------------------------------------------

const ScoreSchema = z.object({
  score: z.number().describe("Predicted performance 0-100 relative to this advertiser's ads"),
  reason: z.string().describe("One-sentence justification"),
  fix: z.string().describe("The single highest-impact change to improve it, one sentence"),
});

const SCORE_PROMPT = `You are the performance brain of an advertising tool. Rate how well an ad is likely to perform for this advertiser, 0-100 (50 = typical for them). Judge the hook strength, offer clarity, audience fit, and visual concept. If a playbook is provided, weigh it heavily — it's learned from their real spend. If the ad is part of an experiment, it deliberately deviates in that one way; don't penalize the deviation being tested. Be a tough, honest judge — media budget rides on this.`;

export async function scoreAd(adId: string): Promise<BrainScore | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const ad = getAd(adId);
  if (!ad) return null;

  const playbook = getPlaybook();
  const experiment = playbook?.experiments?.find((e) => e.id === ad.experimentId);
  const system =
    SCORE_PROMPT +
    productContext() +
    (playbook
      ? `\n\nAdvertiser playbook (from their real spend):\n${playbook.summary}\nCreative: ${playbook.creativeGuidelines}\nVisuals: ${playbook.visualGuidelines}\nAvoid: ${playbook.avoid}`
      : "\n\nNo playbook exists yet — judge on general direct-response instincts and say so in the reason.");

  const script = ad.creative.videoScript
    ?.map((s, i) => `scene ${i + 1}: [${s.visual}] VO: "${s.voiceover}" overlay: "${s.overlayText}"`)
    .join("\n");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: `Ad to rate:\n${adRow(ad)}${script ? `\nScript:\n${script}` : ""}${
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
  updateAd(adId, { brainScore });
  return brainScore;
}

// ---------------------------------------------------------------------------
// Generate: new ad concepts from the playbook
// ---------------------------------------------------------------------------

const ConceptSchema = z.object({
  concepts: z
    .array(
      z.object({
        name: z.string().describe("Short internal name for the ad, e.g. 'POV unboxing angle'"),
        headline: z.string().describe("The ad headline, punchy"),
        primaryText: z.string().describe("Primary ad text / caption, ready to paste"),
        cta: z.string().describe("Call to action button text"),
        visualDescription: z
          .string()
          .describe(
            "For image ads: a complete image-generation prompt describing the visual (subject, composition, style, mood, text-free). For video ads: one line summarizing the visual concept."
          ),
        videoScript: z
          .array(
            z.object({
              visual: z
                .string()
                .describe("Image-generation prompt for this scene's visual, text-free"),
              voiceover: z.string().describe("One spoken sentence for this scene"),
              overlayText: z.string().describe("Short on-screen text, under 8 words"),
            })
          )
          .describe("For video ads only: 3-4 scenes. Empty array for image ads."),
      })
    )
    .describe("The requested number of distinct ad concepts"),
});

const GENERATE_PROMPT = `You are the creative engine of an advertising tool. Generate distinct, ready-to-run ad concepts for the product described. If a playbook is provided it's learned from the advertiser's real spend — follow its guidelines hard. Each concept should take a genuinely different angle (don't produce 3 rewordings of one idea). Direct-response principles: concrete benefit in the first line, specificity beats adjectives, one clear CTA. Visual prompts must describe photographic/graphic content only — no text in the image itself (text gets overlaid separately). Never invent claims, statistics, discounts, or testimonials that weren't provided in the product description or offer.`;

export interface GeneratedConcept {
  name: string;
  creative: AdCreative;
}

export async function generateConcepts(
  format: "image" | "video",
  count: number,
  angle?: string,
  experimentInstruction?: string
): Promise<GeneratedConcept[]> {
  requireKey();
  const p = getProductSettings();
  if (!p.product.trim()) {
    throw new Error("Set your product info on the Brain page first — it's what the ads sell.");
  }
  const playbook = getPlaybook();

  const system =
    GENERATE_PROMPT +
    productContext() +
    (playbook
      ? `\n\nAdvertiser playbook (from real spend — follow it):\n${playbook.creativeGuidelines}\nVisuals: ${playbook.visualGuidelines}\nAvoid: ${playbook.avoid}`
      : "");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 6000,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: [
          `Generate ${count} ${format} ad concept${count === 1 ? "" : "s"}.`,
          angle?.trim() ? `Requested angle/notes: ${angle.trim()}` : "",
          experimentInstruction
            ? `This is an experiment variant — apply this instruction even where it conflicts with the playbook: ${experimentInstruction}`
            : "",
          format === "video"
            ? "Each concept needs a 3-4 scene videoScript."
            : "videoScript must be an empty array.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(ConceptSchema) },
  });

  if (!response.parsed_output) throw new Error("Generation returned no structured output");
  return response.parsed_output.concepts.slice(0, count).map((c) => ({
    name: c.name,
    creative: {
      headline: c.headline,
      primaryText: c.primaryText,
      cta: c.cta,
      visualDescription: c.visualDescription,
      videoScript: format === "video" ? c.videoScript.slice(0, 4) : undefined,
    },
  }));
}

/** Round-robin an ad into "control" or an active experiment arm. */
export function pickExperiment(): string {
  const experiments = getPlaybook()?.experiments ?? [];
  if (experiments.length === 0) return "control";
  const arms = ["control", ...experiments.map((e) => e.id)];
  const counts = new Map(arms.map((a) => [a, 0]));
  for (const ad of listAds()) {
    if (ad.experimentId && counts.has(ad.experimentId)) {
      counts.set(ad.experimentId, (counts.get(ad.experimentId) ?? 0) + 1);
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
