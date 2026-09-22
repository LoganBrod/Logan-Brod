// One Claude call per file: read it, transcribe it if it is a scan, and say
// which course and unit it belongs to. Structured output means we get typed
// JSON back, not prose we have to parse.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODEL_SORT } from "./config.js";
import { recordUsage } from "./usage.js";
import type { Course } from "./vault.js";
import type { Source } from "./reader.js";

export const NOTE_TYPES = ["lecture", "reading", "homework", "lab", "handout", "review", "other"] as const;

const ResultSchema = z.object({
  title: z.string().describe("Short title for the note, 3 to 8 words, no date."),
  course: z.string().describe("Exactly one of the course names given."),
  unit: z.string().describe("Exactly one of that course's listed units, or empty string if none fits."),
  proposed_unit: z
    .string()
    .describe(
      "Only when unit is empty and the material clearly belongs to a unit that is not listed yet: a name in the form 'Unit NN - Name'. Otherwise empty string.",
    ),
  syllabus_units: z
    .array(z.string())
    .describe(
      "Only when this document is a syllabus or course outline that lists the course's units or major topics in order: every unit as 'Unit NN - Name'. Otherwise an empty list.",
    ),
  type: z.enum(NOTE_TYPES),
  date: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD if a date is written on the material, otherwise null."),
  topics: z.array(z.string()).describe("3 to 8 specific topics covered."),
  transcription: z
    .string()
    .describe("For scans: the full content as markdown. For text sources: empty string."),
  confidence: z.number().min(0).max(1).describe("How sure you are about course AND unit together."),
  reason: z.string().describe("One sentence on why this course and unit."),
});

export type Classification = z.infer<typeof ResultSchema>;

const SYSTEM = `You file a high-school student's notes into their study system.

You receive one piece of material: a scan of handwritten or printed pages, a document
from the school's learning platform, or typed notes. You return JSON.

Transcription rules (scans and images only):
- Transcribe everything on the page as markdown. Keep the student's own words and order.
- Use headings for sections the student marked, bullets for lists, tables for tables.
- Math goes in LaTeX between $ signs. Diagrams get a one-line italic description.
- Mark a word you cannot read as [?]. Never guess silently.
- For typed or document sources, leave transcription empty; the original text is kept as-is.

Filing rules:
- course must be one of the listed names, spelled exactly.
- unit must be one of that course's listed units, spelled exactly, or "" if none fits yet.
- confidence is about the filing, not the transcription. Below 0.7 means a human should check.
- A worksheet the teacher handed out is a handout. Problems the student worked are homework.`;

export async function classify(
  client: Anthropic,
  source: Source,
  courses: Course[],
): Promise<Classification> {
  const courseList = courses
    .map((c) => `- ${c.name}\n${c.units.map((u) => `    - ${u}`).join("\n") || "    (no units listed yet)"}`)
    .join("\n");

  const fileName = source.path.split(/[\\/]/).pop();
  const instructions = `Courses and their units:\n${courseList}\n\nFile name: ${fileName}\nSource kind: ${source.kind}\n\nFile this material.`;

  // Text sources only need the small JSON back; scans also carry the transcription.
  const isScan = source.kind === "scan";
  const supportsEffort = !MODEL_SORT.includes("haiku");
  const response = await client.messages.parse({
    model: MODEL_SORT,
    max_tokens: isScan ? 16000 : 1500,
    system: SYSTEM,
    output_config: {
      ...(supportsEffort ? { effort: isScan ? "medium" : "low" } : {}),
      format: zodOutputFormat(ResultSchema),
    },
    messages: [{ role: "user", content: [source.block, { type: "text", text: instructions }] }],
  });
  await recordUsage("ingest", MODEL_SORT, `${source.kind}: ${fileName}`, response.usage);

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to process ${fileName}: ${response.stop_details?.explanation ?? "no reason given"}`);
  }
  if (!response.parsed_output) {
    throw new Error(`Claude returned something that was not the expected JSON for ${fileName}`);
  }
  return response.parsed_output;
}

/** Stand-in for classify() so the file handling can be tested without an API key. */
export function fakeClassify(source: Source, courses: Course[]): Classification {
  const course = courses[0];
  return {
    title: "Fake classification",
    course: course.name,
    unit: course.units[0] ?? "",
    proposed_unit: course.units[0] ? "" : "Unit 01 - Fake Proposed Unit",
    syllabus_units: [],
    type: "lecture",
    date: null,
    topics: ["fake"],
    transcription: source.kind === "scan" ? "_(fake transcription: no API call was made)_" : "",
    confidence: 0.95,
    reason: "--fake flag: first course, first unit.",
  };
}
