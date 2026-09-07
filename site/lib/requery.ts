// The second search, when the first one didn't find enough.
//
// A run writes ten queries, searches, judges, and shows whatever cleared the
// floor. When that is three pieces, the old behaviour was to show three pieces.
// The judge was doing its job - it refused to pad - but nothing upstream
// noticed that the *searches* had been the problem, and a person got a thin
// rail with no explanation and no second try.
//
// This is the second try. It is given what each query actually produced and
// what the judge said was wrong with the pool, and it writes replacements that
// fix the reason: a different garment noun, a different material word, a
// register the first pass missed. Then the run searches again, judges again,
// and merges. Once - a loop that keeps going is a bill, not a feature.
//
// Text only, no photos. The profile already describes the style; what this
// needs is the failure, and the failure is text.

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODELS, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { capBySlot, normaliseSlot, queryCapFor } from "./categories";
import { meter } from "./meter";
import { limitNamedMakers } from "./analyze";
import { RequerySchema, type SearchQuery, type StyleProfile } from "./schemas";
import type { PriceRange } from "./sources/types";

export { MIN_GOOD_PICKS } from "./requeryConst";

/** How many replacement queries to write. Fewer than the first pass: this is a repair, not a restart. */
export const MAX_REQUERIES = 6;

export interface TriedQuery {
  query: string;
  slot?: string;
  found: number;
  viewed: number;
  picked: number;
}

const SYSTEM = `You are a menswear stylist repairing a shopping search that came back thin.

A first pass wrote searches for a person's style, ran them on eBay and Google Shopping, and had every result judged against that style. Most of what came back was rejected. You will be told each search, how many listings it found, how many were judged, how many were kept, and what the judge said was wrong with the pool.

Write replacement searches that fix the reason. If a search found nothing, the words were wrong for how sellers title things - use the plainer garment noun. If it found plenty and the judge kept none, the results were the wrong register or the wrong cut - change the material or style word, not the noun. Never repeat a search that was tried, and never write a near-duplicate of one.

Queries are typed straight into shopping sites: garment noun plus the material, colour or cut that matters. Spread them across garment types and tag each with its slot. Footwear is at most one of them.

Write each reason to the wearer in one sentence, plain second person.`;

export async function rewriteQueries(
  profile: StyleProfile,
  tried: TriedQuery[],
  range: PriceRange,
  /** The judge's notes from the first pass, joined. */
  judgeNotes: string,
  preferences?: string | null,
  namedMakers: string[] = []
): Promise<SearchQuery[]> {
  const report = tried
    .map(
      (t) =>
        `- "${t.query}"${t.slot ? ` (${t.slot})` : ""}: found ${t.found}, judged ${t.viewed}, kept ${t.picked}`
    )
    .join("\n");

  const message = await anthropic().messages.parse({
    model: MODELS.analyze,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      // Between the reader's high and the judge's low: this is reasoning about
      // why words failed, which is harder than recognising a jacket and easier
      // than reading a style off photographs.
      effort: "medium",
      format: zodOutputFormat(RequerySchema),
    },
    messages: [
      {
        role: "user",
        content: `The wearer's style:
Summary: ${profile.summary}
Aesthetics: ${profile.aesthetics.join(", ")}
Palette: ${profile.palette.map((p) => p.name).join(", ")}
Silhouette: ${profile.silhouette}
Fabrics: ${profile.fabrics.join(", ")}
Formality: ${profile.formality}
Budget per piece: $${range.min}-$${range.max}${preferences ? `\n\n${preferences}` : ""}

What the first pass searched for, and what came of each:
${report}

What the judge said about the pool:
${judgeNotes.trim() || "(no notes)"}

Write up to ${MAX_REQUERIES} replacement searches.`,
      },
    ],
  });

  assertNotRefused(message, "requery");
  meter({ op: "closet.requery", model: MODELS.analyze, usage: message.usage, extra: { tried: tried.length } });
  const parsed = requireParsed(message.parsed_output, "requery");

  // Prompts are asked; code enforces. Nothing already tried, nothing that only
  // differs by punctuation, the same slot spread as the first pass, and named
  // makers still capped.
  return dedupe(parsed.searchQueries, tried.map((t) => t.query));
}

/** Drop repeats of tried queries and of each other, then apply the slot and maker caps. */
export function dedupe(
  queries: SearchQuery[],
  tried: string[],
  makers: string[] = [],
  max: number = MAX_REQUERIES
): SearchQuery[] {
  const seen = new Set(tried.map(bones));
  const fresh: SearchQuery[] = [];
  for (const q of queries) {
    const b = bones(q.query);
    if (!b || seen.has(b)) continue;
    seen.add(b);
    fresh.push(q);
  }
  const spread = capBySlot(fresh, (q) => normaliseSlot(q.category), queryCapFor);
  return limitNamedMakers(spread, makers).slice(0, max);
}

function bones(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
