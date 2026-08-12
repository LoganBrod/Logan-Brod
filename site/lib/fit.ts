// What size to buy from a brand you've never bought from.
//
// This is the question that stops a secondhand purchase dead. A jacket is
// perfect, it's £40, it's a 42 — and a 42 from that maker is not a 42 from the
// one you own. There is no API for this; the answer lives on the brand's own
// size guide and in the accumulated complaints of everyone who guessed wrong.
//
// So the app reads those pages and answers against the measurements the person
// has already given us. The reading is the expensive part — a search quota and
// a model call — so an answer is cached hard per brand and category, because
// "how does Barbour's Bedale fit" has the same answer for everyone and doesn't
// change month to month. What is *not* cached is the recommendation itself,
// which depends on the person: the sources are shared, the size is theirs.

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { getJson, redisConfigured, setJson } from "./redis";
import { FitAdviceSchema, type FitAdvice } from "./schemas";
import { hasSizes, renderSizes, type Sizes } from "./sizing";
import { gather, webSearchConfigured, type SearchHit } from "./websearch";

const SYSTEM = `You are telling one man which size to buy from a brand he hasn't bought from before.

You are given: his own measurements, and the text of a few web pages found by searching for that brand's sizing. The pages are raw — navigation, cookie banners and unrelated product copy included. Read past that and find the size chart or the fit reports.

Two failure modes matter, and they are not symmetrical. Recommending a size the sources don't support costs him a garment that doesn't fit and a return he may not be able to make on a secondhand sale. Saying the evidence is thin costs him nothing but a moment. So when the pages don't actually answer the question — they're about a different brand, a different garment, or say nothing about measurements — say that plainly and set confidence to low. Never fill a gap with what a typical brand does.

A size chart with real measurements is the strong evidence. Fit reports without one are weaker, but they are worth a lot when several agree. One person's opinion is worth almost nothing.

Where a chart gives measurements, match them against his and name the measurement you used. Where it doesn't, reason from the fit reports and say that's what you're doing.

Cite only pages you actually used, by their titles as given.`;

export interface FitRequest {
  brand: string;
  /** What kind of garment — "jacket", "jeans", "boots". Sizing differs wildly within a brand. */
  category: string;
  sizes: Sizes;
}

/** Sources live a long time: a brand's size chart is not news. */
const SOURCES_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * A brand's sizing text, shared across everyone who asks.
 *
 * The search quota is the scarce resource — SerpAPI's free tier is 100 searches
 * a month — so this cache is the difference between the feature being usable
 * and being a novelty someone exhausts in an afternoon.
 */
type CachedSources = Array<SearchHit & { text: string }>;

function sourcesKey(brand: string, category: string): string {
  return `fit:sources:${normalize(brand)}:${normalize(category)}`;
}

/** Lowercased, collapsed, and stripped of anything that isn't a word character. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** The query that actually finds size charts rather than shopping listings. */
export function fitQuery(brand: string, category: string): string {
  return `${brand} ${category} size chart measurements does it run small fit guide`;
}

async function readSources(brand: string, category: string): Promise<CachedSources | null> {
  if (!redisConfigured()) return null;
  try {
    const cached = await getJson<CachedSources>(sourcesKey(brand, category));
    return Array.isArray(cached) && cached.length ? cached : null;
  } catch {
    return null;
  }
}

export interface FitResult {
  advice: FitAdvice;
  /** True when the sources came from cache, so the UI can be honest about freshness. */
  cached: boolean;
  sourceUrls: string[];
}

/**
 * Look up how a brand fits, and what this person should buy.
 *
 * Throws only for the two conditions a caller must handle differently: no
 * search configured, and nothing found. Everything else — a page that wouldn't
 * load, a source that turned out to be irrelevant — is absorbed, because the
 * model is told to reason about how thin the evidence is rather than being
 * shielded from it.
 */
export async function adviseFit({ brand, category, sizes }: FitRequest): Promise<FitResult> {
  if (!webSearchConfigured()) {
    throw new Error("Brand sizing needs SERPAPI_KEY configured.");
  }
  if (!hasSizes(sizes)) {
    throw new Error("Fill in at least one measurement first — there's nothing to compare against.");
  }

  const cached = await readSources(brand, category);
  const sources = cached ?? (await gather(fitQuery(brand, category)));

  if (!sources.length) {
    throw new Error(`Couldn't find anything on how ${brand} sizes run.`);
  }

  if (!cached && redisConfigured()) {
    // Best-effort: a cache write that fails costs a search next time, which is
    // not worth failing a lookup that already succeeded.
    await setJson(sourcesKey(brand, category), sources, SOURCES_TTL_SECONDS).catch(() => {});
  }

  const corpus = sources
    .map((source, index) => `--- SOURCE ${index + 1}: ${source.title}\n${source.url}\n\n${source.text}`)
    .join("\n\n");

  const message = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    output_config: {
      // Reading several pages of messy HTML text and matching a measurement
      // table against a person is genuinely the hardest reasoning in the app,
      // and it happens once per brand rather than once per garment.
      effort: "high",
      format: zodOutputFormat(FitAdviceSchema),
    },
    messages: [
      {
        role: "user",
        content: `Brand: ${brand}
Garment: ${category}

${renderSizes(sizes)}

${corpus}`,
      },
    ],
  });

  assertNotRefused(message, "fit");
  const advice = requireParsed(message.parsed_output, "fit");

  return {
    advice: {
      ...advice,
      // The model is told to cite only what it used, but a hallucinated title
      // is cheap to produce and expensive to trust, so the list is intersected
      // with what was actually sent.
      sources: advice.sources.filter((title) =>
        sources.some((source) => source.title.toLowerCase().includes(title.toLowerCase().slice(0, 20)))
      ),
    },
    cached: Boolean(cached),
    sourceUrls: sources.map((source) => source.url),
  };
}

// ------------------------------------------------------ what's been looked up

/**
 * A person's own history of lookups.
 *
 * Kept per person rather than derived from the shared source cache, because the
 * recommendation is theirs: the same brand gives two people different sizes.
 * This is what makes the page useful on the second visit — the list of brands
 * you've already checked, with what you were told.
 */
export interface FitRecord {
  brand: string;
  category: string;
  advice: FitAdvice;
  checkedAt: string;
}

const HISTORY_LIMIT = 30;
const HISTORY_TTL_SECONDS = 365 * 24 * 60 * 60;

function historyKey(id: string): string {
  return `fit:history:${id}`;
}

export async function readHistory(id: string | null): Promise<FitRecord[]> {
  if (!id || !redisConfigured()) return [];
  try {
    const history = await getJson<FitRecord[]>(historyKey(id));
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

/** Newest first, one entry per brand-and-garment — a re-check replaces, never stacks. */
export async function recordLookup(id: string | null, record: FitRecord): Promise<void> {
  if (!id || !redisConfigured()) return;
  try {
    const history = await readHistory(id);
    const without = history.filter(
      (entry) =>
        normalize(entry.brand) !== normalize(record.brand) ||
        normalize(entry.category) !== normalize(record.category)
    );
    await setJson(historyKey(id), [record, ...without].slice(0, HISTORY_LIMIT), HISTORY_TTL_SECONDS);
  } catch {
    // History is a convenience. Losing an entry must never fail a lookup.
  }
}

/** Drop one lookup. Returns false when there was nothing to drop. */
export async function forgetLookup(
  id: string | null,
  brand: string,
  category: string
): Promise<boolean> {
  if (!id || !redisConfigured()) return false;
  const history = await readHistory(id);
  const remaining = history.filter(
    (entry) => normalize(entry.brand) !== normalize(brand) || normalize(entry.category) !== normalize(category)
  );
  if (remaining.length === history.length) return false;
  await setJson(historyKey(id), remaining, HISTORY_TTL_SECONDS);
  return true;
}

/**
 * The line about brand fit that goes into a sweep digest.
 *
 * This is the "alerts you" half of the feature: a standing search that turns up
 * a Barbour when you've already been told Barbour runs small is in a position
 * to say so, at the moment it matters, without being asked.
 */
export function fitNoteFor(history: FitRecord[], title: string): string | null {
  const haystack = title.toLowerCase();
  const match = history.find((entry) => haystack.includes(entry.brand.toLowerCase()));
  if (!match) return null;

  const { advice } = match;
  if (advice.runs === "unknown" && advice.confidence === "low") return null;

  const runs =
    advice.runs === "true" ? "fits true to size" : advice.runs === "unknown" ? null : `runs ${advice.runs}`;

  return [`${match.brand}: you were told ${advice.recommendation}`, runs].filter(Boolean).join(", ") + ".";
}
