// Pulls files teachers post on Schoology, from every class: Materials → Documents and
// assignment attachments. The teacher's Materials folders become the course's units, and
// each file lands in its unit's folder in the vault, where ingest turns it into a note with
// no guessing. Files pulled before folders were known are moved into place.
//
//   npm run materials          download new files, refile old ones into their units
//   npm run materials:dry      list what would happen
//   npm run materials:folders  print each class's folder tree as Schoology has it
import fs from "node:fs/promises";
import path from "node:path";
import { DIRS, isIgnoredCourse, normName } from "./config.js";
import { vaultPath, exists, appendLog, safeName, notify, readCourses, addUnitsToCourse, findNoteBy, moveFile, updateFrontmatter, addToUnitMap } from "./vault.js";
import {
  me, mySections, sectionDocuments, sectionAssignments, assignmentDetail, filesOf,
  downloadAttachment, folderMap, type Attachment,
} from "./schoology.js";
import { SUPPORTED } from "./reader.js";

const dryRun = process.argv.includes("--dry-run");
const showFolders = process.argv.includes("--folders");
const MAX_BYTES = 25 * 1024 * 1024; // the ingest sends files to Claude whole; keep them sane

type State = Record<string, { course: string; title: string; savedAs: string | null; seen: string; unit?: string }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Chinese" in the vault and "Chinese IV" on Schoology are the same class. */
const sameCourse = (a: string, b: string) => {
  const x = normName(a), y = normName(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
};

/** A file pulled earlier (or its note) that now has a unit: move it there. True when something moved. */
async function refile(savedAs: string, course: string, unit: string, dry: boolean): Promise<boolean> {
  const target = vaultPath(DIRS.courses, course, unit);
  const note = await findNoteBy("source", savedAs);
  if (note) {
    if (path.dirname(note) === target) return false;
    if (dry) return true;
    const src = path.join(path.dirname(note), DIRS.sources, savedAs);
    const moved = await moveFile(note, target);
    if (await exists(src)) { await fs.mkdir(path.join(target, DIRS.sources), { recursive: true }); await moveFile(src, path.join(target, DIRS.sources)); }
    await updateFrontmatter(moved, { unit });
    await addToUnitMap(course, unit, path.basename(moved, ".md"));
    await appendLog(`moved "${path.basename(moved)}" → ${course} / ${unit} (Schoology folder)`);
    return true;
  }
  // Not a note yet: the raw file may still be waiting in the course folder or the inbox.
  for (const dir of [vaultPath(DIRS.courses, course), vaultPath(DIRS.inbox), vaultPath(DIRS.inbox, course)]) {
    const raw = path.join(dir, savedAs);
    if (await exists(raw)) {
      if (dry) return true;
      await fs.mkdir(target, { recursive: true });
      await moveFile(raw, target);
      return true;
    }
  }
  return false;
}

async function main() {
  const who = await me();
  const sections = await mySections(who.uid);
  const statePath = vaultPath(DIRS.system, "schoology-materials-state.json");
  const state: State = (await exists(statePath)) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};
  const today = new Date().toISOString().slice(0, 10);

  // A class on Schoology with no folder in the vault gets one, so its files have somewhere to go.
  const existing = (await readCourses()).map((c) => c.name);
  for (const s of sections) {
    if (isIgnoredCourse(s.course_title)) continue;
    if (existing.some((e) => sameCourse(e, s.course_title))) continue;
    const dir = vaultPath(DIRS.courses, safeName(s.course_title));
    console.log(`new course folder: ${safeName(s.course_title)}${dryRun ? " (dry run: not created)" : ""}`);
    if (dryRun) continue;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "_Course.md"),
      `---\ncourse: ${safeName(s.course_title)}\nteacher: \nperiod: \nunits: []\nstudy_hours:\n  quiz: 1.5\n  test: 4\n  final: 8\n---\n\n# ${safeName(s.course_title)}\n\nCreated from Schoology. Units fill in as notes arrive; edit freely.\n`,
    );
    await appendLog(`created course folder "${safeName(s.course_title)}" from Schoology`);
  }

  let downloaded = 0, skipped = 0, refiled = 0;
  const courseFolders = (await readCourses()).map((c) => c.name);
  for (const s of sections) {
    const course = s.course_title;
    if (isIgnoredCourse(course)) { console.log(`\n${course}: ignored (IGNORE_COURSES)`); continue; }
    console.log(`\n${course}`);
    const folder = courseFolders.find((e) => sameCourse(e, course)) ?? safeName(course);

    // The teacher's folders. Top-level folder = unit in the vault.
    let folders: { paths: Map<string, string[]>; order: string[] } = { paths: new Map(), order: [] };
    try { folders = await folderMap(s.id); }
    catch (err) { console.log(`  (could not read Materials folders: ${err instanceof Error ? err.message.slice(0, 80) : err})`); }
    const units = folders.order.map(safeName).filter(Boolean);
    if (showFolders) {
      const tree = new Map<string, string[]>();
      for (const [key, trail] of folders.paths) tree.set(trail.join(" / ") || "(top level)", [...(tree.get(trail.join(" / ") || "(top level)") ?? []), key]);
      for (const [dir, keys] of tree) console.log(`  ${dir}: ${keys.length} item${keys.length === 1 ? "" : "s"}`);
      continue;
    }
    if (units.length && !dryRun) {
      const added = await addUnitsToCourse(folder, units);
      if (added.length) { console.log(`  units from Schoology: ${added.join(", ")}`); await appendLog(`${folder}: units from Schoology folders: ${added.join(", ")}`); }
    }
    const unitOf = (key: string) => { const u = folders.paths.get(key)?.[0]; return u ? safeName(u) : ""; };
    const destDir = (unit: string) => unit ? vaultPath(DIRS.courses, folder, unit) : vaultPath(DIRS.courses, folder);

    // Materials → Documents
    const candidates: { from: string; file: Attachment; unit: string }[] = [];
    for (const d of await sectionDocuments(s.id)) {
      for (const f of filesOf(d)) candidates.push({ from: d.title, file: f, unit: unitOf(`document:${d.id}`) });
    }
    await sleep(150);

    // Assignments: one detail call each, the first time we meet the assignment.
    for (const a of await sectionAssignments(s.id)) {
      const key = `assignment:${a.id}`;
      const unit = unitOf(key);
      if (state[key]) { if (unit && !state[key].unit && !dryRun) state[key].unit = unit; continue; }
      await sleep(150);
      const detail = await assignmentDetail(s.id, a.id);
      for (const f of filesOf(detail)) candidates.push({ from: a.title, file: f, unit });
      if (!dryRun) state[key] = { course, title: a.title, savedAs: null, seen: today, unit };
    }

    // Files pulled before the folders were known: move them into their unit.
    for (const { file, unit } of candidates) {
      const had = state[file.id];
      if (!had?.savedAs || !unit || had.unit === unit) continue;
      const moved = await refile(had.savedAs, folder, unit, dryRun);
      if (moved) { refiled++; console.log(`  ${dryRun ? "would move" : "moved"}  ${had.savedAs} → ${unit}`); }
      if (!dryRun) had.unit = unit;
    }

    for (const { from, file, unit } of candidates) {
      if (state[file.id]) continue;
      const original = file.filename ?? file.title ?? `file-${file.id}`;
      const ext = path.extname(original).toLowerCase();
      const label = `${from} / ${original}`;

      if (!SUPPORTED.includes(ext)) {
        console.log(`  skip  ${label}  (${ext || "no extension"} not supported yet)`);
        state[file.id] = { course, title: label, savedAs: null, seen: today };
        skipped++;
        continue;
      }
      if ((file.filesize ?? 0) > MAX_BYTES) {
        console.log(`  skip  ${label}  (${Math.round((file.filesize ?? 0) / 1e6)} MB, too large)`);
        state[file.id] = { course, title: label, savedAs: null, seen: today };
        skipped++;
        continue;
      }
      if (!file.download_path) {
        console.log(`  skip  ${label}  (no download link)`);
        state[file.id] = { course, title: label, savedAs: null, seen: today };
        skipped++;
        continue;
      }

      // Course name first so the ingest sees it in the filename.
      const savedAs = safeName(`${course} - ${path.basename(original, ext)}`) + ext;
      console.log(`  ${dryRun ? "would get" : "get"}   ${label}${unit ? `  → ${unit}` : ""}`);
      if (dryRun) continue;

      const bytes = await downloadAttachment(file.download_path);
      // Straight into the teacher's folder in the vault; ingest turns it into a note there.
      await fs.mkdir(destDir(unit), { recursive: true });
      await fs.writeFile(path.join(destDir(unit), savedAs), bytes);
      state[file.id] = { course, title: label, savedAs, seen: today, unit };
      await appendLog(`schoology materials: pulled "${savedAs}" from ${course} (${from})`);
      downloaded++;
      await sleep(150);
    }
  }

  if (showFolders) return;
  if (!dryRun) await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(`\n${dryRun ? "would download" : "downloaded"} ${downloaded}, skipped ${skipped}${refiled ? `, ${dryRun ? "would move" : "moved"} ${refiled} into units` : ""}.`);
  if (!dryRun && downloaded > 0) {
    await notify("files_pulled", `${downloaded} file${downloaded === 1 ? "" : "s"} pulled from Schoology`, "00 Inbox");
    console.log("Run `npm run ingest` to file them.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
