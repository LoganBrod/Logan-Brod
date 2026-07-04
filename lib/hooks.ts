import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

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

const SYSTEM_PROMPT = `You write viral short-form clip packaging for a gambling/slots streamer's X (Twitter) account.

You are given the transcript of a clip (usually a big win, near-miss, or wild reaction on a slot or casino game) plus optional notes from the creator.

Produce:
1. "hooks": 5 on-screen hook text options. Under 10 words each, ALL CAPS energy without literally being all caps, curiosity gap or stakes-driven ("He put his LAST $100 on..."). Never spoil the exact payout in the hook — tease it.
2. "caption": one X caption ready to post. Structure: strong first line, 1-2 relevant emoji max, a question or call to engagement, then a final line with "18+ | Gamble responsibly". Do not invent dollar amounts that aren't in the transcript or notes. No hashtag spam — at most 2 hashtags.

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
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Clip transcript:\n${transcript.trim() || "(no speech detected)"}`,
          notes?.trim() ? `Creator notes:\n${notes.trim()}` : "",
          promoCode?.trim()
            ? `Promo code (mention it naturally exactly once in the caption, before the disclosure line): ${promoCode.trim()}`
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
