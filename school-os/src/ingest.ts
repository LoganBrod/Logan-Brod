// The inbox sorter. Run it and every file in 00 Inbox gets read, transcribed
// if it is a scan, and filed under 01 Courses/<course>/<unit>/.
//
//   npm run ingest            file everything
//   npm run ingest:dry        show what would happen, change nothing
//   npm run ingest:fake       same, without calling Claude (tests the wiring)
//
// What it never does: rewrite the body of a note you typed, or delete anything.
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { CONFIDENCE_THRESHOLD, DIRS, MAX_SPEND_PER_RUN, MODEL_SORT } from "./config.js";
import { spentThisRun, money } from "./usage.js";
import {
  listInbox, readCourses, writeNote, updateFrontmatter, moveFile, addToUnitMap, addUnitsToCourse,
  appendLog, appendNeedsReview, vaultPath, exists, readNote, notify, type Course,
} from "./vault.js";
import { readSource, SUPPORTED, type Source } from "./reader.js";
import { classify, fakeClassify, type Classification } from "./classify.js";
import { gdocsConfigured, pullGoogleDocs } from "./gdocs.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const fake = args.has("--fake");

async function main() {
  const courses = await readCourses();
  console.log(`Courses: ${courses.map((c) => c.name).join(", ")}`);
  if (dryRun) console.log("Dry run: nothing will be written or moved. (It still calls Claude and costs the same as a real run; --fake is free.)\n");
  if (!fake) console.log(`Sorting with ${MODEL_SORT}; stopping this run at ${money(MAX_SPEND_PER_RUN)}.\n`);

  if (gdocsConfigured()) {
    console.log("Pulling Google Docs...");
    const n = await pullGoogleDocs(dryRun);
    console.log(`  ${n} doc(s) pulled.\n`);
  }

  const client = fake ? null : new Anthropic();
  const files = await listInbox();
  if (files.length === 0) {
    console.log("Inbox is empty.");
    return;
  }

  let filed = 0, review = 0, skipped = 0, failed = 0;
  for (const file of files) {
    const name = path.basename(file);
    if (!fake && spentThisRun() >= MAX_SPEND_PER_RUN) {
      console.log(`\nBudget for this run (${money(MAX_SPEND_PER_RUN)}) reached. The rest of the inbox waits for the next run.`);
      break;
    }
    try {
      const outcome = await handle(file, courses, client);
      if (outcome === "filed") filed++;
      else if (outcome === "review") review++;
      else skipped++;
      console.log(`${outcome.padEnd(7)} ${name}`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAILED  ${name}\n        ${message}`);
      if (!dryRun) await appendLog(`FAILED ${name}: ${message}`);
    }
  }
  console.log(`\nfiled ${filed}, needs review ${review}, skipped ${skipped}, failed ${failed}${fake ? "" : ` · spent ${money(spentThisRun())}`}`);
  if (!dryRun && filed > 0) await notify("notes_sorted", `${filed} note${filed === 1 ? "" : "s"} filed`);
  if (!dryRun && review > 0) await notify("needs_review", `${review} note${review === 1 ? "" : "s"} need${review === 1 ? "s" : ""} your review`, "04 System/Needs Review.md");
}

type Outcome = "filed" | "review" | "skipped";

async function handle(file: string, courses: Course[], client: Anthropic | null): Promise<Outcome> {
  if (!(await exists(file))) return "skipped"; // moved earlier this run, alongside its note
  const ext = path.extname(file).toLowerCase();
  if (!SUPPORTED.includes(ext)) {
    console.log(`        (${ext || "no extension"} not supported; export it as PDF)`);
    return "skipped";
  }

  // A note we already marked needs-review that the student has since fixed:
  // course and unit filled in and status flipped to organized. File it, no API call.
  if (ext === ".md") {
    const { data } = await readNote(file);
    if (data.sorted_by === "agent" && data.status === "organized" && data.course) {
      if (!dryRun) await fileNote(file, String(data.course), String(data.unit ?? ""), data.source ? String(data.source) : null);
      return "filed";
    }
    if (data.status === "needs-review") return "skipped"; // still waiting on the student
  }

  const source = await readSource(file);
  if (!source) return "skipped";
  if (source.refuse) {
    console.log(`        ${source.refuse}`);
    if (!dryRun) await appendLog(`held "${path.basename(file)}": ${source.refuse}`);
    return "skipped";
  }
  if (source.kind === "document" && source.pages) console.log(`        text layer found, ${source.pages} page(s): no vision needed`);

  const result = client ? await classify(client, source, courses) : fakeClassify(source, courses);
  const course = courses.find((c) => c.name === result.course);

  // A syllabus teaches the course its units. Only when the course has none yet, so a
  // hand-edited list is never overwritten.
  if (course && course.units.length === 0 && result.syllabus_units.length > 0) {
    console.log(`        syllabus lists ${result.syllabus_units.length} units for ${course.name}: ${result.syllabus_units.join(", ")}`);
    if (!dryRun) {
      const added = await addUnitsToCourse(course.name, result.syllabus_units);
      course.units.push(...added);
      await appendLog(`learned ${added.length} units for ${course.name} from "${path.basename(file)}"`);
    }
  }

  // Nothing listed fits but the brain has a clear name for it: create the unit.
  if (course && result.unit === "" && result.proposed_unit && result.confidence >= CONFIDENCE_THRESHOLD) {
    console.log(`        new unit for ${course.name}: ${result.proposed_unit}`);
    if (!dryRun) {
      const added = await addUnitsToCourse(course.name, [result.proposed_unit]);
      course.units.push(...added);
      await appendLog(`created unit "${result.proposed_unit}" in ${course.name} for "${path.basename(file)}"`);
    }
    result.unit = result.proposed_unit;
    if (dryRun) course.units.push(result.proposed_unit); // so the dry run reports "filed", as the real run would
  }

  // No unit is fine for course-wide material (a syllabus, a policy sheet): it files
  // into the course folder itself. A unit that is not on the course's list is not fine.
  const unitOk = Boolean(course && (result.unit === "" || course.units.includes(result.unit)));
  const confident = result.confidence >= CONFIDENCE_THRESHOLD && unitOk;

  const date = result.date ?? asDateString(source.existingFrontmatter?.date) ?? today();
  const title = `${date} ${result.title}`;
  const body = source.verbatimBody ?? result.transcription;

  console.log(`        → ${result.course} / ${result.unit || "(no unit)"} · ${result.type} · ${result.confidence.toFixed(2)}`);
  console.log(`        ${result.reason}`);
  if (dryRun) return confident ? "filed" : "review";

  const frontmatter = {
    ...(source.existingFrontmatter ?? {}),
    course: result.course,
    unit: result.unit,
    type: result.type,
    date,
    topics: result.topics,
    source_kind: source.kind,
    sorted_by: "agent",
    confidence: Number(result.confidence.toFixed(2)),
    reason: result.reason,
    status: confident ? "organized" : "needs-review",
  };

  if (source.kind === "text" && ext === ".md") {
    // The student's own note: keep the file, add frontmatter, move it.
    await updateFrontmatter(file, frontmatter);
    if (confident) await fileNote(file, result.course, result.unit, null);
    else await flagForReview(file, result);
    return confident ? "filed" : "review";
  }

  // A scan or document: write a new markdown note next to it, keep the original.
  const isScan = source.kind === "scan";
  const noteDir = confident ? unitDir(result.course, result.unit) : vaultPath(DIRS.inbox);
  const sourceDir = confident ? path.join(noteDir, DIRS.sources) : vaultPath(DIRS.inbox);
  const movedSource = confident ? await moveFile(file, sourceDir) : file;
  const noteBody = isScan
    ? `${body}\n\n---\n_Transcribed from [[${path.basename(movedSource)}]]._`
    : `${body}\n\n---\n_Imported from [[${path.basename(movedSource)}]]._`;
  const notePath = await writeNote(noteDir, title, { ...frontmatter, source: path.basename(movedSource) }, noteBody);

  if (confident) {
    if (result.unit) await addToUnitMap(result.course, result.unit, path.basename(notePath, ".md"));
    await appendLog(`filed "${path.basename(notePath)}" → ${result.course} / ${result.unit || "(course-wide)"}`);
    return "filed";
  }
  await flagForReview(notePath, result);
  return "review";
}

/** Moves a note (and its original file, if any) into its unit folder and links it from the unit map. */
async function fileNote(notePath: string, course: string, unit: string, sourceName: string | null) {
  const dir = unitDir(course, unit);
  const moved = await moveFile(notePath, dir);
  if (sourceName) {
    const src = path.join(path.dirname(notePath), sourceName);
    if (await exists(src)) await moveFile(src, path.join(dir, DIRS.sources));
  }
  if (unit) await addToUnitMap(course, unit, path.basename(moved, ".md"));
  await appendLog(`filed "${path.basename(moved)}" → ${course} / ${unit || "(course-wide)"}`);
}

async function flagForReview(notePath: string, result: Classification) {
  const why = `guessed ${result.course} / ${result.unit || "no unit"} at ${result.confidence.toFixed(2)}: ${result.reason}`;
  await appendNeedsReview(path.basename(notePath, ".md"), why);
  await appendLog(`needs review "${path.basename(notePath)}": ${why}`);
}

function unitDir(course: string, unit: string): string {
  return unit ? vaultPath(DIRS.courses, course, unit) : vaultPath(DIRS.courses, course);
}

/** Frontmatter dates come back from the YAML parser as Date objects; we want YYYY-MM-DD. */
function asDateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
