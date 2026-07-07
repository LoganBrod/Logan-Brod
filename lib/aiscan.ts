import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Highlight } from "./store";
import type { Segment } from "./transcribe";

const MomentsSchema = z.object({
  moments: z
    .array(
      z.object({
        start: z.number().describe("Start time in seconds"),
        end: z.number().describe("End time in seconds"),
        label: z
          .string()
          .describe("Short punchy description of the moment, under 8 words"),
        intensity: z
          .number()
          .describe("How clip-worthy, 0 to 1"),
      })
    )
    .describe("The most clip-worthy moments, best first, up to 8"),
});

const SYSTEM_PROMPT = `You find the most clip-worthy moments in long videos from their timestamped transcripts — for streamers, sports, podcasts, gaming, IRL, anything.

You'll get transcript segments as "[start-end] text" lines. Pick up to 8 moments that would work as standalone short-form clips: the funniest reactions, hype moments, wild swings, hot takes, arguments, clutch plays, emotional beats, quotable lines.

Rules:
- A moment should be a self-contained beat: setup + payoff. Usually 10-60 seconds.
- Prefer moments with strong emotional energy in the words (laughter cues, exclamations, disbelief, trash talk).
- start/end must come from the transcript timestamps, widened slightly so the moment breathes.
- label: short and specific ("blows a 20x on the last spin", "unreal trick shot call"), not generic ("funny moment").
- If the transcript is dull, return fewer moments — don't pad.`;

/** Ask Claude to pick clip-worthy moments from a timestamped transcript. */
export async function findMoments(
  segments: Segment[],
  videoDuration: number
): Promise<Highlight[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("AI scan needs ANTHROPIC_API_KEY set in .env.local");
  }
  if (segments.length === 0) {
    throw new Error("No speech found in this video to scan");
  }

  const fmt = (t: number) => Math.round(t);
  const transcript = segments
    .map((s) => `[${fmt(s.start)}-${fmt(s.end)}] ${s.text}`)
    .join("\n");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }],
    output_config: { format: zodOutputFormat(MomentsSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("AI scan returned no structured output");
  }

  return response.parsed_output.moments
    .filter((m) => m.end > m.start && m.start < videoDuration)
    .slice(0, 8)
    .map((m) => ({
      time: Math.min(videoDuration, (m.start + m.end) / 2),
      score: Math.max(0, Math.min(1, m.intensity)),
      suggestedStart: Math.max(0, m.start - 3),
      suggestedEnd: Math.min(videoDuration, m.end + 2),
      source: "ai" as const,
      label: m.label,
    }))
    .sort((a, b) => a.time - b.time);
}
