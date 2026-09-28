// Filing without Claude. A file dropped straight into a course folder (01 Courses/<Course>/)
// or into a course-named folder inside the inbox (00 Inbox/<Course>/) already says which
// course it belongs to, so it becomes a note there with no call at all. Typed PDFs, Word,
// PowerPoint, markdown and text work; a scan or photo has no text to read without Claude,
// so it waits where it is.
//
// This runs at the start of every ingest, key or no key. With no key it is the only sorter.
import fs from "node:fs/promises";
import path from "node:path";
import { DIRS } from "./config.js";
import { vaultPath, writeNote, moveFile, appendLog, exists, updateFrontmatter, addToUnitMap, type Course } from "./vault.js";
import { readSource, SUPPORTED } from "./reader.js";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9㐀-鿿]/g, "");

/** Every file waiting in a course folder or a course-named inbox folder, with its course. */
export async function findDrops(courses: Course[]): Promise<{ file: string; course: string; unit: string }[]> {
  const drops: { file: string; course: string; unit: string }[] = [];
  const isDrop = (name: string) => !name.startsWith(".") && !name.startsWith("_") && SUPPORTED.includes(path.extname(name).toLowerCase()) && !name.endsWith(".md");
  for (const c of courses) {
    const dir = vaultPath(DIRS.courses, c.name);
    if (!(await exists(dir))) continue;
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isFile() && isDrop(e.name)) drops.push({ file: path.join(dir, e.name), course: c.name, unit: "" });
      // A unit folder (the teacher's Schoology folder, or one the student made): files inside belong to it.
      if (e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith(".")) {
        for (const f of await fs.readdir(path.join(dir, e.name), { withFileTypes: true })) if (f.isFile() && isDrop(f.name)) drops.push({ file: path.join(dir, e.name, f.name), course: c.name, unit: e.name });
      }
    }
  }
  const inbox = vaultPath(DIRS.inbox);
  if (await exists(inbox)) {
    for (const e of await fs.readdir(inbox, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const course = courses.find((c) => norm(c.name) === norm(e.name) || norm(c.name).startsWith(norm(e.name)) || norm(e.name).startsWith(norm(c.name)));
      if (!course) continue;
      const sub = path.join(inbox, e.name);
      for (const f of await fs.readdir(sub, { withFileTypes: true })) if (f.isFile() && (isDrop(f.name) || f.name.endsWith(".md"))) drops.push({ file: path.join(sub, f.name), course: course.name, unit: "" });
    }
  }
  return drops.sort((a, b) => a.file.localeCompare(b.file));
}

/** Files every drop it can read. Returns how many became notes and how many wait for Claude. */
export async function fileByFolder(courses: Course[], dryRun: boolean): Promise<{ filed: number; waiting: number }> {
  const drops = await findDrops(courses);
  let filed = 0, waiting = 0;
  for (const { file, course, unit } of drops) {
    const name = path.basename(file);
    const source = await readSource(file);
    if (!source || source.kind === "scan" || !source.verbatimBody?.trim()) {
      if (process.env.ANTHROPIC_API_KEY && source && !source.refuse && !path.dirname(file).endsWith(vaultPath(DIRS.inbox)) ) {
        // Handwriting or a photo with a known course (and unit): hand it to the sorter with both in its name.
        const tagged = `${course}${unit ? ` - ${unit}` : ""} - ${name.replace(new RegExp(`^${course.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-\\s*`, "i"), "")}`;
        console.log(`to Claude  ${name} → inbox as "${tagged}"${dryRun ? " (dry run)" : ""}`);
        if (!dryRun) { await fs.mkdir(vaultPath(DIRS.inbox), { recursive: true }); await fs.rename(file, vaultPath(DIRS.inbox, tagged)); }
        continue;
      }
      waiting++;
      console.log(`waits   ${name}  (${course}: ${source?.refuse ?? "a scan or photo; reading it needs Claude"})`);
      continue;
    }
    const title = name.replace(/\.[^.]+$/, "").replace(new RegExp(`^${course.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-\\s*`, "i"), "").trim() || name;
    const stat = await fs.stat(file);
    const date = stat.mtime.toISOString().slice(0, 10);
    console.log(`filed   ${name} → ${course}${unit ? ` / ${unit}` : ""}${dryRun ? " (dry run)" : ""}`);
    if (dryRun) { filed++; continue; }
    const dir = unit ? vaultPath(DIRS.courses, course, unit) : vaultPath(DIRS.courses, course);
    const isNote = file.endsWith(".md");
    if (isNote) {
      // The student's own markdown: keep it as is, give it a home.
      const moved = await moveFile(file, dir);
      if (unit) { await updateFrontmatter(moved, { course, unit }); await addToUnitMap(course, unit, path.basename(moved, ".md")); }
      await appendLog(`filed "${path.basename(moved)}" → ${course}${unit ? ` / ${unit}` : ""} (by folder)`);
      filed++;
      continue;
    }
    const movedSource = await moveFile(file, path.join(dir, DIRS.sources));
    const notePath = await writeNote(dir, title, {
      title, course, unit, type: guessType(title), date, topics: [],
      source_kind: source.kind, source: path.basename(movedSource), sorted_by: "folder", status: "organized",
    }, `${source.verbatimBody}\n\n---\n_Imported from [[${path.basename(movedSource)}]]._`);
    if (unit) await addToUnitMap(course, unit, path.basename(notePath, ".md"));
    await appendLog(`filed "${title}" → ${course}${unit ? ` / ${unit}` : ""} (by folder, no Claude call)`);
    filed++;
  }
  return { filed, waiting };
}

/** A rough type from the file name, so past tests and practice sets are told apart from slides. */
export function guessType(title: string): string {
  const t = title.toLowerCase();
  if (/\b(exam|test|quiz|frq|mcq)\b/.test(t) && /solution|answer|key/.test(t)) return "answer key";
  if (/\b(exam|test|quiz|midterm|final)\b/.test(t)) return "past test";
  if (/practice|problem|worksheet|homework|\bhw\b|\bps\b|problem set|review/.test(t)) return "practice";
  if (/solution|answer key/.test(t)) return "answer key";
  if (/slides?|lecture|presentation|notes/.test(t)) return "slides";
  if (/syllabus|outline|policy|rubric|integrity|registration|guide/.test(t)) return "course info";
  if (/textbook|chapter|reading|ch\.?\s*\d/.test(t)) return "reading";
  return "handout";
}

