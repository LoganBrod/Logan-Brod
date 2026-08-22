import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { MODELS, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { meter } from "./meter";
import type { StyleProfile } from "./schemas";
import {
  BUDGETS,
  OCCASION_SLOTS,
  buyLinks,
  isCologneBudget,
  isCologneSlot,
  type CologneBudget,
  type CologneSlot,
} from "./cologneOptions";

export { BUDGETS, OCCASION_SLOTS, buyLinks, isCologneBudget, isCologneSlot };
export type { CologneBudget, CologneSlot };

/**
 * Fragrance, and why this one page doesn't search a marketplace.
 *
 * Everything else here finds real listings on secondhand markets. Fragrance is
 * the one category where that would be irresponsible: it is among the most
 * counterfeited things sold online, a fake is not distinguishable from a
 * photograph, and the people using this are sixteen to twenty-four with no
 * particular reason to know that. Pointing them at cheap "authentic" bottles on
 * a secondhand marketplace would mostly be pointing them at fakes.
 *
 * So this recommends from what the model knows — houses, notes, seasons, how
 * something actually wears — and sends people to buy from sellers who can be
 * held to it. No prices, because it has no way to know today's, and a stale
 * price is worse than none.
 */

const BUDGET_LINE: Record<CologneBudget, string> = {
  "under-50": "Under $50 a bottle. This is a real part of the market — say so rather than apologising for it.",
  "50-120": "Between $50 and $120 a bottle, which is where most of the worthwhile range sits.",
  "over-120": "Over $120 a bottle. Designer and niche are both fair game.",
};

const SLOT_LINE: Record<CologneSlot, string> = {
  everyday: "For everyday — worn around people who did not choose to smell it. Projection should be modest.",
  evening: "For evenings and close quarters. It can be richer, and it can be noticed.",
  warm: "For warm weather. Nothing that turns cloying in heat.",
  cold: "For cold weather, where a thin fragrance disappears entirely.",
};

const SYSTEM = `You are recommending fragrances to a young man, from what you know about them rather than from any shop's stock.

Recommend real, currently available fragrances. Name the house and the fragrance exactly as it is sold — that name is what he will search for, so getting it wrong wastes the whole recommendation.

Say what it actually smells like in plain words. "Bergamot, then something dry and woody underneath, like a pencil case" tells him more than a list of notes he has never smelled, and far more than the marketing does. Be specific about how it wears: how long it lasts, how far it projects, and whether it is the kind of thing people comment on.

Be honest about the obvious. If something is very widely worn, say so — that is a reason for some people and against it for others, and he can decide. If a cheaper fragrance is genuinely as good as an expensive one, say that too.

Tie the recommendation to how he dresses. Not mystically — a man whose wardrobe is washed cotton and worn-in boots is not going to feel like himself in something polished and sweet, and that is a real reason to steer him elsewhere.

Never invent a fragrance, a house, a price or a note. If you are not confident something exists and is still sold, leave it out.

Write everything to him, in plain second person. No lists of adjectives, no perfume-counter language.`;

const CologneSchema = z.object({
  house: z.string().describe("The maker, exactly as it is sold. E.g. 'Dior'."),
  name: z.string().describe("The fragrance name, exactly as it is sold. E.g. 'Sauvage'."),
  smells: z.string().describe("What it actually smells like, in plain words, to him."),
  wears: z.string().describe("How long it lasts and how far it projects, plainly."),
  whyYou: z.string().describe("One sentence tying it to how he dresses."),
  ubiquity: z
    .enum(["everywhere", "known", "uncommon"])
    .describe("How widely worn it is. 'everywhere' means he will smell it on other people."),
  season: z.string().describe("When it works best. A few words."),
});

const CologneAdviceSchema = z.object({
  intro: z.string().describe("Two or three sentences to him about how this should sit with his clothes."),
  picks: z.array(CologneSchema),
  howToBuy: z
    .string()
    .describe("Two sentences on buying safely — samples first, and why the cheap bottles are fake."),
});

export type ColognePick = z.infer<typeof CologneSchema>;
export interface CologneAdvice {
  intro: string;
  picks: ColognePick[];
  howToBuy: string;
}

/** Enough to choose between without becoming a catalogue. */
export const MAX_PICKS = 5;

export async function recommendColognes(
  /** The style from their last clozet, when they have one. */
  profile: StyleProfile | null,
  slot: CologneSlot,
  budget: CologneBudget,
  preferences?: string | null
): Promise<CologneAdvice> {
  const style = profile
    ? `How he dresses, read from pieces he already likes:
Summary: ${profile.summary}
Aesthetics: ${profile.aesthetics.join(", ")}
Palette: ${profile.palette.map((p) => p.name).join(", ")}
Fabrics: ${profile.fabrics.join(", ")}
Formality: ${profile.formality}`
    : "He hasn't built a clozet yet, so you don't know how he dresses. Recommend on the occasion and budget alone, and don't pretend to know more than you do.";

  const message = await anthropic().messages.parse({
    model: MODELS.analyze,
    max_tokens: 6000,
    system: SYSTEM,
    output_config: {
      // Higher than the other text calls. This one is recall — real fragrances,
      // named exactly right — and a hallucinated bottle is the failure mode
      // that makes the whole page worthless.
      effort: "high",
      format: zodOutputFormat(CologneAdviceSchema),
    },
    messages: [
      {
        role: "user",
        content: `${style}${preferences ? `\n\n${preferences}` : ""}

${SLOT_LINE[slot]}
${BUDGET_LINE[budget]}

Give him ${MAX_PICKS} or fewer. Fewer is better than padding.`,
      },
    ],
  });

  assertNotRefused(message, "colognes");
  const advice = requireParsed(message.parsed_output, "colognes");

  meter({
    op: "colognes",
    model: MODELS.analyze,
    usage: message.usage,
    extra: { slot, budget, picks: advice.picks.length, hadProfile: Boolean(profile) },
  });

  return { ...advice, picks: advice.picks.slice(0, MAX_PICKS) };
}
