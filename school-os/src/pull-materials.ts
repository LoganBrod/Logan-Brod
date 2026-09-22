// Pulls files teachers post on Schoology into 00 Inbox: Materials → Documents and
// assignment attachments, from every class. Each file is downloaded once; the
// ingest then files it under its course like anything else in the inbox.
//
//   npm run materials          download new files into the inbox
//   npm run materials:dry      list what would be downloaded
import fs from "node:fs/promises";
import path from "node:path";
import { DIRS } from "./config.js";
import { vaultPath, exists, appendLog, safeName, notify, readCourses } from "./vault.js";
import {
  me, mySections, sectionDocuments, sectionAssignments, assignmentDetail, filesOf,
  downloadAttachment, type Attachment,
} from "./schoology.js";
import { SUPPORTED } from "./reader.js";

const dryRun = process.argv.includes("--dry-run");
const MAX_BYTES = 25 * 1024 * 1024; // the ingest sends files to Claude whole; keep them sane

type State = Record<string, { course: string; title: string; savedAs: string | null; seen: string }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const who = await me();
  const sections = await mySections(who.uid);
  const statePath = vaultPath(DIRS.system, "schoology-materials-state.json");
  const state: State = (await exists(statePath)) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};
  const today = new Date().toISOString().slice(0, 10);

  // A class on Schoology with no folder in the vault gets one, so its files have somewhere to go.
  const existing = (await readCourses()).map((c) => c.name);
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const s of sections) {
    if (existing.some((e) => norm(e) === norm(s.course_title))) continue;
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

  let downloaded = 0, skipped = 0;
  for (const s of sections) {
    const course = s.course_title;
    console.log(`\n${course}`);

    // Materials → Documents
    const candidates: { from: string; file: Attachment }[] = [];
    for (const d of await sectionDocuments(s.id)) {
      for (const f of filesOf(d)) candidates.push({ from: d.title, file: f });
    }
    await sleep(150);

    // Assignments: one detail call each, the first time we meet the assignment.
    for (const a of await sectionAssignments(s.id)) {
      const key = `assignment:${a.id}`;
      if (state[key]) continue;
      await sleep(150);
      const detail = await assignmentDetail(s.id, a.id);
      for (const f of filesOf(detail)) candidates.push({ from: a.title, file: f });
      if (!dryRun) state[key] = { course, title: a.title, savedAs: null, seen: today };
    }

    for (const { from, file } of candidates) {
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
      console.log(`  ${dryRun ? "would get" : "get"}   ${label}`);
      if (dryRun) continue;

      const bytes = await downloadAttachment(file.download_path);
      await fs.writeFile(vaultPath(DIRS.inbox, savedAs), bytes);
      state[file.id] = { course, title: label, savedAs, seen: today };
      await appendLog(`schoology materials: pulled "${savedAs}" from ${course} (${from})`);
      downloaded++;
      await sleep(150);
    }
  }

  if (!dryRun) await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(`\n${dryRun ? "would download" : "downloaded"} ${downloaded}, skipped ${skipped}.`);
  if (!dryRun && downloaded > 0) {
    await notify("files_pulled", `${downloaded} file${downloaded === 1 ? "" : "s"} pulled from Schoology`, "00 Inbox");
    console.log("Run `npm run ingest` to file them.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
