import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  getClip,
  getPlaybook,
  listClips,
  setPlaybook,
  updateClip,
  type BrainScore,
  type Playbook,
} from "./store";

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
  experimentResults: z
    .string()
    .describe(
      "Verdicts on the experiments that were running: which variant won or lost vs control, with the numbers — or 'not enough data yet' per experiment"
    ),
  experiments: z
    .array(
      z.object({
        hypothesis: z
          .string()
          .describe("What is being tested and why, one sentence"),
        instruction: z
          .string()
          .describe(
            "A concrete instruction the clip pipeline applies verbatim to variant clips, e.g. 'Write the hook as a direct question to the viewer'"
          ),
      })
    )
    .describe(
      "Up to 3 NEW experiments to run next, informed by the data and previous results. Fewer is fine."
    ),
});

const SYSTEM_PROMPT = `You are the performance brain of a clipping tool. You get a list of the creator's posted clips with their attributes and engagement metrics. Some clips are tagged with the experiment variant they tested ("experiment=<id>") vs "experiment=control".

Do three things:
1. Find real patterns — moment types, durations, hook styles, caption styles that correlate with views/likes — and turn them into short, concrete, actionable guidelines the tool will feed to its moment scanner and hook writer.
2. Judge the running experiments honestly: compare each variant's numbers against control. Declare winners and losers with the data, or say "not enough data yet".
3. Propose up to 3 new experiments worth running next — concrete, testable, single-variable changes. Fold confirmed winners into the guidelines instead of re-testing them.

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

  const previous = getPlaybook();
  const rows = rated
    .sort((a, b) => (b.metrics!.views ?? 0) - (a.metrics!.views ?? 0))
    .map((c, i) => {
      const m = c.metrics!;
      return [
        `#${i + 1}`,
        `duration=${Math.round(c.end - c.start)}s`,
        `experiment=${c.experimentId ?? "control"}`,
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

  const experimentContext =
    previous?.experiments?.length
      ? `\n\nExperiments that were running (clips tagged with these ids):\n${previous.experiments
          .map((e) => `${e.id}: ${e.hypothesis} — variant instruction: "${e.instruction}"`)
          .join("\n")}`
      : "\n\nNo experiments were running yet — propose the first ones.";

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Posted clips, best-performing first:\n\n${rows}${experimentContext}`,
      },
    ],
    output_config: { format: zodOutputFormat(PlaybookSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Analysis returned no structured output");
  }

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

const ScoreSchema = z.object({
  score: z
    .number()
    .describe("Predicted performance 0-100 relative to this creator's clips"),
  reason: z.string().describe("One-sentence justification"),
});

const SCORE_PROMPT = `You are the performance brain of a clipping tool. Rate how well a clip is likely to perform as a short-form post for this creator, 0-100 (50 = typical for them). Judge the moment itself (from the transcript/notes), the duration, and the hook/caption quality. If a creator playbook is provided, weigh it heavily — it's learned from their real numbers. If the clip is part of an experiment, it deliberately deviates from the playbook in that one way; don't penalize the deviation being tested. Be a tough, honest judge — the score gates auto-posting.`;

/** Predict a clip's performance and persist the score on its record. */
export async function scoreClip(clipId: string): Promise<BrainScore | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const clip = getClip(clipId);
  if (!clip) return null;

  const playbook = getPlaybook();
  const experiment = playbook?.experiments?.find((e) => e.id === clip.experimentId);
  const parts = [
    `duration=${Math.round(clip.end - clip.start)}s`,
    clip.transcript ? `transcript="${clip.transcript.slice(0, 500).replace(/\n/g, " ")}"` : "(no transcript)",
    clip.notes ? `notes="${clip.notes.slice(0, 150)}"` : "",
    clip.hooks?.length ? `hooks=${JSON.stringify(clip.hooks)}` : "",
    clip.caption ? `caption="${clip.caption.replace(/\n/g, " ")}"` : "",
    experiment
      ? `experiment variant: ${experiment.hypothesis} (instruction: "${experiment.instruction}")`
      : "",
  ].filter(Boolean);

  const system =
    SCORE_PROMPT +
    (playbook
      ? `\n\nCreator playbook (from their real performance data):\n${playbook.summary}\nWhat works: ${playbook.momentGuidelines}\nHooks: ${playbook.hookGuidelines}\nAvoid: ${playbook.avoid}`
      : "\n\nNo playbook exists yet — judge on general short-form virality instincts and say so in the reason.");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: `Clip to rate:\n${parts.join("\n")}` }],
    output_config: { format: zodOutputFormat(ScoreSchema) },
  });

  if (!response.parsed_output) return null;
  const brainScore: BrainScore = {
    score: Math.max(0, Math.min(100, Math.round(response.parsed_output.score))),
    reason: response.parsed_output.reason,
    at: new Date().toISOString(),
  };
  updateClip(clipId, { brainScore });
  return brainScore;
}

/**
 * Assign a new clip to "control" or one of the active experiments,
 * round-robin balanced by how many clips each arm already has.
 */
export function pickExperiment(): string {
  const experiments = getPlaybook()?.experiments ?? [];
  if (experiments.length === 0) return "control";
  const arms = ["control", ...experiments.map((e) => e.id)];
  const counts = new Map(arms.map((a) => [a, 0]));
  for (const clip of listClips()) {
    if (clip.experimentId && counts.has(clip.experimentId)) {
      counts.set(clip.experimentId, (counts.get(clip.experimentId) ?? 0) + 1);
    }
  }
  return arms.reduce((least, arm) =>
    (counts.get(arm) ?? 0) < (counts.get(least) ?? 0) ? arm : least
  );
}

/** The variant instruction for a clip's experiment, if it's in one. */
export function experimentInstruction(experimentId?: string): string | undefined {
  if (!experimentId || experimentId === "control") return undefined;
  return getPlaybook()?.experiments?.find((e) => e.id === experimentId)?.instruction;
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
