// Turns a unit's notes into study material, and grades practice tests you took.
//
// Triggers, from Obsidian (put the tag anywhere in a note of that unit, or in _Unit.md):
//   #make-flashcards   → 02 Study/Flashcards/<Course> - <Unit>.md   (Spaced Repetition format)
//   #make-test         → 02 Study/Practice Tests/<Course> - <Unit> - Test N.md
//   #make-review       → 02 Study/Unit Reviews/<Course> - <Unit>.md
//   #grade-me          → on a practice test you typed answers into: writes "<test> - Graded.md"
//
// Scope: a tag in a note that belongs to a unit uses every note in that unit. A tag in a
// course-wide note (no unit, e.g. a slide deck filed under the course itself) uses that
// note alone, so a syllabus never ends up in a flashcard deck.
//
// Or from the terminal, no tag needed:
//   npm run study -- flashcards "Macro Economics" "Unit 01 - Basics"
//   npm run study -- test "Macro Economics"            (whole course)
//
// The tag is removed from the note once the material is written.
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
import { MODEL_STUDY, DIRS } from "./config.js";
import { recordUsage, spentThisRun, money } from "./usage.js";
import {
  vaultPath, readNote, listCourseNotes, findNotesWithTag, removeTag, writeNote, appendLog,
  appendLine, notify, exists, safeName,
} from "./vault.js";

type Kind = "flashcards" | "test" | "review";
const TAGS: Record<string, Kind> = { "#make-flashcards": "flashcards", "#make-test": "test", "#make-review": "review" };
const GRADE_TAG = "#grade-me";

const argv = process.argv.slice(2);
const fake = argv.includes("--fake");
const positional = argv.filter((a) => !a.startsWith("--"));

const PROMPTS: Record<Kind, string> = {
  flashcards: `Write flashcards for the Obsidian Spaced Repetition plugin from these notes.

Format rules, exactly:
- First line: the deck tag given below, on its own line.
- Then a blank line, then cards separated by blank lines.
- Short card: "Question::Answer" on one line.
- Longer card: question line, then a line with only "?", then the answer lines.
- No headings, no bullets, no numbering, no commentary before or after the cards.

Card rules:
- 25 to 60 cards depending on how much the notes cover. Cover every distinct concept once.
- One fact per card. Definitions, formulas, cause→effect, compare/contrast, worked mini-examples.
- Math in LaTeX between $ signs. Ask in the student's own vocabulary from the notes.
- Never invent facts not supported by the notes.`,

  test: `Write a practice test from these notes. Markdown.

Structure:
# <Course> — <Unit> practice test
One line: how to take it (answer under each question, then add #grade-me at the top and run the brain).

## Part A · Multiple choice (8 questions)
## Part B · Short answer (5 questions)
## Part C · Free response (2 questions, multi-part)

Rules:
- Number questions continuously, bold like **3.**. Multiple choice options A to D on separate lines.
- Under EVERY question leave an answer line for the student: a line with just "Your answer:".
- After each question put the answer in a collapsed callout so it is hidden until clicked:
  > [!answer]- Answer
  > <the answer, with a one-sentence why>
- Match the difficulty and vocabulary of the notes. Cover the whole unit, weight what the notes spend the most time on.
- Never test a fact the notes do not support.`,

  review: `Write a unit review from these notes. Markdown, for a student to read the night before a test.

Sections:
# <Course> — <Unit> review
## Big picture (3 to 5 sentences: what this unit is about and why it matters)
## Key concepts (each: bold term, one or two tight sentences, from the notes)
## Formulas and rules (if any; LaTeX between $ signs; when to use each)
## How things connect (bullets linking concepts to each other)
## Common mistakes (what students get wrong here, inferred from the material)
## Self-check (8 questions, answers hidden in > [!answer]- callouts)

Rules: only what the notes support. Tight, no filler. Use the student's own terms.`,
};

const GRADE_PROMPT = `You are grading a student's practice test. The test has questions with "Your answer:" lines the student filled in, and hidden answer callouts.

Return markdown:
# Graded: <test title>
**Score:** X / Y (count each question equally; unanswered = 0)

Then for every question: the number, ✅ / ⚠️ / ❌, the student's answer in one line, the correct answer, and one or two sentences of feedback that explain the gap. Be specific and kind.

Finish with:
## Weak topics
Bullets naming the topics behind the wrong or partial answers, most important first.
## Next step
Two or three sentences on what to review and how.`;

async function main() {
  const client = fake ? null : new Anthropic();

  // Terminal form
  if (positional.length >= 2) {
    const [kind, course, unit] = positional as [string, string, string | undefined];
    if (!(kind in PROMPTS)) throw new Error(`kind must be flashcards, test or review; got "${kind}"`);
    await generate(client, kind as Kind, course, unit ?? "", null);
    return;
  }

  // Tag form
  let did = 0;
  for (const [tag, kind] of Object.entries(TAGS)) {
    for (const notePath of await findNotesWithTag(tag)) {
      const { data } = await readNote(notePath);
      if (!data.course) {
        console.log(`skip  ${path.basename(notePath)}: ${tag} but the note has no course in its frontmatter`);
        continue;
      }
      await generate(client, kind, String(data.course), String(data.unit ?? ""), notePath, !data.unit);
      await removeTag(notePath, tag);
      did++;
    }
  }
  for (const testPath of await findNotesWithTag(GRADE_TAG)) {
    await grade(client, testPath);
    await removeTag(testPath, GRADE_TAG);
    did++;
  }
  if (did === 0) console.log("Nothing to do. Add #make-flashcards, #make-test, #make-review or #grade-me to a note.");
  else if (!fake) console.log(`\nspent ${money(spentThisRun())} on ${MODEL_STUDY}`);
}

async function generate(client: Anthropic | null, kind: Kind, course: string, unit: string, trigger: string | null, single = false) {
  const notes = single && trigger ? [trigger] : await listCourseNotes(course, unit || undefined);
  if (notes.length === 0) throw new Error(`No notes found for ${course}${unit ? " / " + unit : ""}`);
  const label = single && trigger
    ? `${course} - ${path.basename(trigger, ".md")}`
    : unit ? `${course} - ${unit}` : `${course} - Whole course`;
  console.log(`${kind}: ${label} from ${notes.length} note(s)`);

  const material = (await Promise.all(notes.map(async (p) => {
    const { body } = await readNote(p);
    return `<note title="${path.basename(p, ".md")}">\n${body.trim()}\n</note>`;
  }))).join("\n\n");

  const deckTag = `#flashcards/${slug(course)}/${slug(unit || "course")}`;
  const instructions = `${PROMPTS[kind]}\n\nCourse: ${course}\nUnit: ${unit || "(whole course)"}\nDeck tag (flashcards only): ${deckTag}`;
  const text = client
    ? await ask(client, instructions, material)
    : `${kind === "flashcards" ? deckTag + "\n\n" : ""}_(fake ${kind} for ${label}; no API call was made)_`;

  const dir = { flashcards: "Flashcards", test: "Practice Tests", review: "Unit Reviews" }[kind];
  const base = kind === "test" ? await nextTestName(vaultPath("02 Study", dir), label) : safeName(label);
  const target = kind === "test"
    ? await writeNote(vaultPath("02 Study", dir), base, { course, unit, kind, generated_by: "agent", sources: notes.length }, text)
    : await overwriteNote(vaultPath("02 Study", dir, `${base}.md`), { course, unit, kind, generated_by: "agent", sources: notes.length }, text);

  const rel = path.relative(vaultPath(), target);
  console.log(`  wrote ${rel}`);
  await appendLog(`generated ${kind} for ${label} → ${rel}${trigger ? ` (tag in ${path.basename(trigger)})` : ""}`);
  await notify("study_generated", `${cap(kind)} ready: ${label}`, rel);
}

async function grade(client: Anthropic | null, testPath: string) {
  const { data, body } = await readNote(testPath);
  const title = path.basename(testPath, ".md");
  console.log(`grading: ${title}`);
  const text = client ? await ask(client, GRADE_PROMPT, body) : `# Graded: ${title}\n_(fake grading; no API call was made)_\n\n## Weak topics\n- fake topic`;
  const target = await overwriteNote(
    path.join(path.dirname(testPath), `${title} - Graded.md`),
    { course: data.course ?? "", unit: data.unit ?? "", kind: "graded", generated_by: "agent", test: title },
    text,
  );
  const weak = text.split(/^## Weak topics/m)[1]?.split(/^## /m)[0]?.trim();
  if (weak && data.course && data.unit) {
    const map = vaultPath(DIRS.courses, String(data.course), String(data.unit), "_Unit.md");
    if (await exists(map)) await appendLine(map, `\n## Weak topics from ${title} (${new Date().toISOString().slice(0, 10)})\n${weak}\n`);
  }
  const rel = path.relative(vaultPath(), target);
  console.log(`  wrote ${rel}`);
  await appendLog(`graded "${title}" → ${rel}`);
  await notify("study_generated", `Graded: ${title}`, rel);
}

async function ask(client: Anthropic, instructions: string, material: string): Promise<string> {
  const stream = client.messages.stream({
    model: MODEL_STUDY,
    max_tokens: 12000,
    system: "You write study material for a high-school student from their own notes. Output only the material, in the exact format asked. No preamble, no closing remarks.",
    messages: [{ role: "user", content: [
      { type: "text", text: `Notes:\n\n${material}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: instructions },
    ] }],
  });
  const response = await stream.finalMessage();
  const cost = await recordUsage("study", MODEL_STUDY, instructions.slice(0, 40), response.usage);
  console.log(`  cost ${money(cost)}`);
  if (response.stop_reason === "refusal") throw new Error("Claude declined to generate this material");
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() + "\n";
}

/** Same name every time for flashcards and reviews: regenerating replaces the old file. */
async function overwriteNote(target: string, frontmatter: Record<string, unknown>, body: string): Promise<string> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, matter.stringify(body, { ...frontmatter, updated: new Date().toISOString().slice(0, 10) }));
  return target;
}

async function nextTestName(dir: string, label: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const existing = (await fs.readdir(dir)).filter((f) => f.startsWith(`${safeName(label)} - Test `) && !f.includes("Graded"));
  return `${safeName(label)} - Test ${existing.length + 1}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
