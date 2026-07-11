import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getPlaybook, listClips, setPlaybook, type Playbook } from "./store";

const PlaybookSchema = z.object({
  summary: z
    .string()
    .describe("2-3 sentence plain-language summary of what's working and what isn't"),
  momentGuidelines: z
    .string()
    .describe(
      "Concrete guidance for the moment scanner: what kinds of moments to prioritize, ideal clip length, pacing — based on what performed"
    ),
  hookGuidelines: z
    .string()
    .describe("Concrete guidance for hook/caption writing based on what performed"),
  avoid: z.string().describe("Patterns that underperformed and should be avoided"),
});

const SYSTEM_PROMPT = `You are the performance brain of a clipping tool. You get a list of the creator's posted clips with their attributes and engagement metrics. Find real patterns — moment types, durations, hook styles, caption styles that correlate with views/likes — and turn them into short, concrete, actionable guidelines the tool will feed to its moment scanner and hook writer.

Be honest about sample size: with few clips, keep guidelines soft and note the uncertainty in the summary. Never invent patterns the data doesn't show.`;

/**
 * Analyze posted-clip performance with Claude and store the resulting
 * playbook. The playbook is injected into the AI moment scanner and the
 * hook writer, so the whole pipeline steers toward what performs.
 */
export async function analyzePerformance(): Promise<Playbook> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Performance analysis needs ANTHROPIC_API_KEY set in .env.local");
  }

  const rated = listClips().filter((c) => c.metrics);
  if (rated.length < 3) {
    throw new Error(
      `Need metrics on at least 3 clips to find patterns (have ${rated.length}). Post clips, then add their views/likes on the clip cards.`
    );
  }

  const rows = rated
    .sort((a, b) => (b.metrics!.views ?? 0) - (a.metrics!.views ?? 0))
    .map((c, i) => {
      const m = c.metrics!;
      return [
        `#${i + 1}`,
        `duration=${Math.round(c.end - c.start)}s`,
        `views=${m.views} likes=${m.likes} reposts=${m.reposts}`,
        c.notes ? `notes="${c.notes.slice(0, 100)}"` : "",
        c.hooks?.[0] ? `hook="${c.hooks[0]}"` : "",
        c.caption ? `caption="${c.caption.slice(0, 120).replace(/\n/g, " ")}"` : "",
        c.transcript ? `transcript="${c.transcript.slice(0, 200).replace(/\n/g, " ")}"` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Posted clips, best-performing first:\n\n${rows}`,
      },
    ],
    output_config: { format: zodOutputFormat(PlaybookSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Analysis returned no structured output");
  }

  const playbook: Playbook = {
    ...response.parsed_output,
    updatedAt: new Date().toISOString(),
  };
  setPlaybook(playbook);
  return playbook;
}

/** Playbook snippet for the AI moment scanner's prompt, if one exists. */
export function playbookForScanner(): string {
  const p = getPlaybook();
  if (!p) return "";
  return `\n\nCreator playbook (learned from this creator's past clip performance — weigh it heavily when choosing moments):\n${p.momentGuidelines}\nAvoid: ${p.avoid}`;
}

/** Playbook snippet for the hook/caption writer's prompt, if one exists. */
export function playbookForHooks(): string {
  const p = getPlaybook();
  if (!p) return "";
  return `\n\nCreator playbook (learned from past performance — follow it):\n${p.hookGuidelines}\nAvoid: ${p.avoid}`;
}
