import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { playbookForHooks } from "./evolve";

const HookResultSchema = z.object({
  hooks: z
    .array(z.string())
    .describe("5 short on-screen hook text options, each under 10 words"),
  caption: z
    .string()
    .describe("One ready-to-post X caption for the clip"),
});

export interface HookResult {
  hooks: string[];
  caption: string;
}

const SYSTEM_PROMPT = `You write viral short-form clip packaging for creators — streamers, sports pages, podcasters, gamers, IRL channels.

You are given the transcript of a clip (a funny reaction, hype moment, clutch play, hot take, big win...) plus optional notes from the creator.

Produce:
1. "hooks": 5 on-screen hook text options. Under 10 words each, ALL CAPS energy without literally being all caps, curiosity gap or stakes-driven ("He put his LAST $100 on...", "The ref did NOT see this coming"). Never spoil the payoff in the hook — tease it.
2. "caption": one X caption ready to post. Structure: strong first line, 1-2 relevant emoji max, then a question or call to engagement. Do not invent numbers, scores, or amounts that aren't in the transcript or notes. No hashtag spam — at most 2 hashtags. If the content involves gambling or casino play, end the caption with a final line: "18+ | Gamble responsibly".

Keep everything grounded in what actually happens in the transcript. If the transcript is empty or unclear, work from the creator notes.`;

/**
 * Generate hook/caption options with Claude. Returns null when
 * ANTHROPIC_API_KEY isn't set so the pipeline can finish without it.
 */
export async function generateHooks(
  transcript: string,
  notes?: string,
  promoCode?: string
): Promise<HookResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT + playbookForHooks(),
    messages: [
      {
        role: "user",
        content: [
          `Clip transcript:\n${transcript.trim() || "(no speech detected)"}`,
          notes?.trim() ? `Creator notes:\n${notes.trim()}` : "",
          promoCode?.trim()
            ? `Promo line (mention it naturally exactly once in the caption): ${promoCode.trim()}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    output_config: { format: zodOutputFormat(HookResultSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Hook generation returned no structured output");
  }
  return response.parsed_output;
}
