// Everything that touches the vault on disk lives here, so the other scripts
// never call fs directly. Rule: never rewrite the body of a note the student
// wrote. We only add frontmatter, move files, and append to generated files.
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { VAULT_PATH, DIRS } from "./config.js";

export type Course = { name: string; units: string[] };

export type NoteFrontmatter = Record<string, unknown>;

export function vaultPath(...parts: string[]): string {
  return path.join(VAULT_PATH, ...parts);
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Every visible file directly inside 00 Inbox. Dotfiles are skipped. */
export async function listInbox(): Promise<string[]> {
  const dir = vaultPath(DIRS.inbox);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => path.join(dir, e.name))
    .sort();
}

/** Reads every 01 Courses/<name>/_Course.md and returns the course list. */
export async function readCourses(): Promise<Course[]> {
  const dir = vaultPath(DIRS.courses);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const courses: Course[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const cardPath = path.join(dir, entry.name, "_Course.md");
    if (!(await exists(cardPath))) continue;
    const { data } = matter(await fs.readFile(cardPath, "utf8"));
    const units = Array.isArray(data.units)
      ? data.units.map((u: unknown) => String(u).trim()).filter(Boolean)
      : [];
    // The folder name is the source of truth; the card's course: line should match it.
    courses.push({ name: entry.name, units });
  }
  if (courses.length === 0) {
    throw new Error(`No courses found. Add 01 Courses/<name>/_Course.md for each class.`);
  }
  return courses;
}

/** Adds units to a course card, keeping existing ones. Returns the units actually added. */
export async function addUnitsToCourse(course: string, units: string[]): Promise<string[]> {
  const cardPath = vaultPath(DIRS.courses, course, "_Course.md");
  const { data, content } = matter(await fs.readFile(cardPath, "utf8"));
  const existing = Array.isArray(data.units) ? data.units.map((u: unknown) => String(u).trim()).filter(Boolean) : [];
  const added = units.map((u) => u.trim()).filter((u) => u && !existing.includes(u));
  if (added.length === 0) return [];
  await fs.writeFile(cardPath, matter.stringify(content, { ...data, units: [...existing, ...added] }));
  return added;
}

export async function readNote(p: string): Promise<{ data: NoteFrontmatter; body: string }> {
  const { data, content } = matter(await fs.readFile(p, "utf8"));
  return { data, body: content };
}

/** Writes a note. Refuses to overwrite: picks "name (2).md" instead. */
export async function writeNote(
  dir: string,
  baseName: string,
  frontmatter: NoteFrontmatter,
  body: string,
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const target = await freePath(path.join(dir, `${safeName(baseName)}.md`));
  await fs.writeFile(target, matter.stringify(body.trimEnd() + "\n", frontmatter));
  return target;
}

/** Rewrites only the frontmatter of an existing note; the body stays byte-identical. */
export async function updateFrontmatter(p: string, patch: NoteFrontmatter): Promise<void> {
  const { data, content } = matter(await fs.readFile(p, "utf8"));
  const merged: NoteFrontmatter = { ...data, ...patch };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k]; // undefined = remove the key
  await fs.writeFile(p, matter.stringify(content, merged));
}

/** Replaces the body of a note we generated (e.g. a re-exported Google Doc). */
export async function replaceBody(p: string, body: string): Promise<void> {
  const { data } = matter(await fs.readFile(p, "utf8"));
  await fs.writeFile(p, matter.stringify(body.trimEnd() + "\n", data));
}

export async function moveFile(from: string, toDir: string): Promise<string> {
  await fs.mkdir(toDir, { recursive: true });
  const target = await freePath(path.join(toDir, path.basename(from)));
  await fs.rename(from, target);
  return target;
}

export async function appendLine(p: string, line: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, line.endsWith("\n") ? line : line + "\n");
}

/** Adds a wikilink to the unit map, creating the map if the unit is new. */
export async function addToUnitMap(course: string, unit: string, noteTitle: string): Promise<void> {
  const mapPath = vaultPath(DIRS.courses, course, unit, "_Unit.md");
  if (!(await exists(mapPath))) {
    await fs.mkdir(path.dirname(mapPath), { recursive: true });
    await fs.writeFile(
      mapPath,
      matter.stringify(`# ${unit}\n\n## Notes\n`, { course, unit, maintained_by: "agent" }),
    );
  }
  const current = await fs.readFile(mapPath, "utf8");
  const link = `- [[${noteTitle}]]`;
  if (!current.includes(link)) await appendLine(mapPath, link);
}

export async function appendLog(message: string): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  await appendLine(vaultPath(DIRS.system, "agent-log.md"), `- ${stamp} ${message}`);
}

export async function appendNeedsReview(noteTitle: string, reason: string): Promise<void> {
  await appendLine(vaultPath(DIRS.system, "Needs Review.md"), `- [[${noteTitle}]] — ${reason}`);
}

export type NotificationKind =
  | "test_posted" | "assignment_posted" | "notes_sorted" | "needs_review" | "study_generated" | "files_pulled";

/** Appends one entry to 04 System/notifications.json (newest first). The dashboard app reads this. */
export async function notify(kind: NotificationKind, title: string, link?: string): Promise<void> {
  const p = vaultPath(DIRS.system, "notifications.json");
  const list: unknown[] = (await exists(p)) ? JSON.parse(await fs.readFile(p, "utf8")) : [];
  list.unshift({
    id: `n_${Date.now().toString(36)}`,
    time: new Date().toISOString(),
    kind,
    title,
    link: link ?? null,
    read: false,
  });
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(list.slice(0, 500), null, 2));
}

/** All markdown notes under a course (or one unit of it), excluding maps and sources. */
export async function listCourseNotes(course: string, unit?: string): Promise<string[]> {
  const root = unit ? vaultPath(DIRS.courses, course, unit) : vaultPath(DIRS.courses, course);
  if (!(await exists(root))) return [];
  const out: string[] = [];
  for await (const p of walkMarkdown(root)) {
    const base = path.basename(p);
    if (base === "_Course.md" || base === "_Unit.md") continue;
    if (p.split(path.sep).includes(DIRS.sources)) continue;
    out.push(p);
  }
  return out.sort();
}

/** Every markdown note in the vault whose body contains the tag. */
export async function findNotesWithTag(tag: string): Promise<string[]> {
  const out: string[] = [];
  for await (const p of walkMarkdown(VAULT_PATH)) {
    const raw = await fs.readFile(p, "utf8");
    if (raw.includes(tag)) out.push(p);
  }
  return out;
}

/**
 * Removes a trigger tag from a note. The one case where the brain touches a note
 * body: the tag was an instruction to it, and leaving it would re-run every time.
 */
export async function removeTag(p: string, tag: string): Promise<void> {
  const raw = await fs.readFile(p, "utf8");
  const cleaned = raw.replace(new RegExp(`[ \\t]*${tag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?![\\w/-])`, "g"), "");
  await fs.writeFile(p, cleaned);
}

/** Finds the note whose frontmatter has the given key/value, anywhere in the vault. */
export async function findNoteBy(key: string, value: string): Promise<string | null> {
  for await (const p of walkMarkdown(VAULT_PATH)) {
    const raw = await fs.readFile(p, "utf8");
    if (!raw.startsWith("---")) continue;
    const { data } = matter(raw);
    if (data[key] === value) return p;
  }
  return null;
}

async function* walkMarkdown(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkMarkdown(full);
    else if (entry.name.endsWith(".md")) yield full;
  }
}

/** Obsidian forbids these characters in filenames. */
export function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

async function freePath(p: string): Promise<string> {
  if (!(await exists(p))) return p;
  const ext = path.extname(p);
  const stem = p.slice(0, -ext.length);
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
}
