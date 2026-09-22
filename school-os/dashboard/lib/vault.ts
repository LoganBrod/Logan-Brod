// Server-only reads of the vault. Same folder layout the brain writes to.
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), "..", ".env") });
loadEnv({ path: path.join(process.cwd(), ".env") });

export const VAULT = path.resolve(process.env.VAULT_PATH ?? "");
const COURSES = "01 Courses", STUDY = "02 Study", SYSTEM = "04 System", INBOX = "00 Inbox";

export type Note = {
  rel: string; name: string; course: string; unit: string; type: string; date: string;
  topics: string[]; excerpt: string; sourceKind: string; status: string; mtime: number;
};
export type Course = { name: string; units: string[]; hue: number; noteCount: number };
export type Assessment = { id: string; title: string; when: string; kind: string; course: string };
export type Session = { start: string; end: string; label: string; course: string; title: string; kind: string; when: string; id: string };
export type Notification = { id: string; time: string; kind: string; title: string; link: string | null; read: boolean };

/** Schoology ids look like "a:123"; a colon in a URL segment never reaches a Next.js page. */
export const idToSlug = (id: string) => id.replace(":", "-");
export const slugToId = (slug: string) => slug.replace("-", ":");
export const hueOf = (name: string) => [250, 150, 30, 330, 200, 80, 300][[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 7];
export const today = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (d: string) => Math.round((Date.parse(d) - Date.parse(today())) / 86_400_000);

async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }
async function readJson<T>(rel: string, fallback: T): Promise<T> {
  const p = path.join(VAULT, rel);
  return (await exists(p)) ? JSON.parse(await fs.readFile(p, "utf8")) : fallback;
}

export async function courses(): Promise<Course[]> {
  const dir = path.join(VAULT, COURSES);
  if (!(await exists(dir))) return [];
  const out: Course[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const card = path.join(dir, e.name, "_Course.md");
    if (!(await exists(card))) continue;
    const { data } = matter(await fs.readFile(card, "utf8"));
    const units = Array.isArray(data.units) ? data.units.map(String).filter(Boolean) : [];
    out.push({ name: e.name, units, hue: hueOf(e.name), noteCount: (await notesOf(e.name)).length });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function notesOf(course: string, unit?: string): Promise<Note[]> {
  const root = unit ? path.join(VAULT, COURSES, course, unit) : path.join(VAULT, COURSES, course);
  if (!(await exists(root))) return [];
  const out: Note[] = [];
  async function walk(dir: string) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith("_") && !e.name.startsWith(".")) await walk(full); continue; }
      if (!e.name.endsWith(".md") || e.name.startsWith("_")) continue;
      const raw = await fs.readFile(full, "utf8");
      const { data, content } = matter(raw);
      const st = await fs.stat(full);
      out.push({
        rel: path.relative(VAULT, full), name: e.name.slice(0, -3), course,
        unit: String(data.unit ?? ""), type: String(data.type ?? ""), date: dateStr(data.date),
        topics: Array.isArray(data.topics) ? data.topics.map(String) : [],
        excerpt: content.replace(/^#.*$/gm, "").replace(/[*_`>#\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 220),
        sourceKind: String(data.source_kind ?? ""), status: String(data.status ?? ""), mtime: st.mtimeMs,
      });
    }
  }
  await walk(root);
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime);
}

export async function readNote(rel: string): Promise<{ data: Record<string, unknown>; body: string; rel: string } | null> {
  const full = path.join(VAULT, rel);
  if (!full.startsWith(VAULT) || !(await exists(full))) return null;
  const { data, content } = matter(await fs.readFile(full, "utf8"));
  return { data, body: content, rel };
}

/** Resolve an Obsidian [[wikilink]] (basename) to a vault-relative path, if it exists. */
export async function resolveLink(name: string): Promise<string | null> {
  const target = name.split("|")[0].split("#")[0].trim();
  const hits = await findFiles(VAULT, (f) => f === `${target}.md` || f === target);
  return hits[0] ? path.relative(VAULT, hits[0]) : null;
}

async function findFiles(dir: string, pred: (name: string) => boolean, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await findFiles(full, pred, depth + 1)));
    else if (pred(e.name)) out.push(full);
  }
  return out;
}

export async function assessments(): Promise<Assessment[]> {
  const state = await readJson<Record<string, Omit<Assessment, "id">>>(`${SYSTEM}/schoology-state.json`, {});
  return Object.entries(state).map(([id, a]) => ({ id, ...a })).filter((a) => a.when >= today()).sort((a, b) => a.when.localeCompare(b.when));
}
export const tests = async () => (await assessments()).filter((a) => ["test", "quiz", "project"].includes(a.kind));
export const studyPlan = () => readJson<Session[]>(`${SYSTEM}/study-plan.json`, []);
export const notifications = () => readJson<Notification[]>(`${SYSTEM}/notifications.json`, []);

export async function needsReview(): Promise<number> {
  const dir = path.join(VAULT, INBOX);
  if (!(await exists(dir))) return 0;
  let n = 0;
  for (const f of await fs.readdir(dir)) {
    if (!f.endsWith(".md")) continue;
    const { data } = matter(await fs.readFile(path.join(dir, f), "utf8"));
    if (data.status === "needs-review") n++;
  }
  return n;
}

export type Material = { kind: "flashcards" | "test" | "review" | "graded"; rel: string; name: string; course: string; unit: string };
export async function materials(course?: string): Promise<Material[]> {
  const out: Material[] = [];
  for (const [dir, kind] of [["Flashcards", "flashcards"], ["Practice Tests", "test"], ["Unit Reviews", "review"]] as const) {
    const full = path.join(VAULT, STUDY, dir);
    if (!(await exists(full))) continue;
    for (const f of await fs.readdir(full)) {
      if (!f.endsWith(".md")) continue;
      const { data } = matter(await fs.readFile(path.join(full, f), "utf8"));
      if (course && String(data.course) !== course) continue;
      out.push({ kind: f.includes("Graded") ? "graded" : kind, rel: path.join(STUDY, dir, f), name: f.slice(0, -3), course: String(data.course ?? ""), unit: String(data.unit ?? "") });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Parse a Spaced Repetition deck into cards. Supports "Q::A" and multi-line "Q\n?\nA". */
export function parseDeck(body: string): { q: string; a: string }[] {
  const cards: { q: string; a: string }[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.trim().split("\n").filter((l) => !l.startsWith("#flashcards"));
    if (!lines.length) continue;
    const q = lines.findIndex((l) => l.trim() === "?");
    if (q > 0) cards.push({ q: lines.slice(0, q).join("\n"), a: lines.slice(q + 1).join("\n") });
    else for (const l of lines) { const i = l.indexOf("::"); if (i > 0) cards.push({ q: l.slice(0, i).trim(), a: l.slice(i + 2).trim() }); }
  }
  return cards;
}

function dateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return "";
}

export const brief = () => readJson<{ date: string; time: string; text: string } | null>(`${SYSTEM}/brief.json`, null);

/** Keyword search across every filed note: title, topics, unit, body. Scores by term hits. */
export async function searchNotes(query: string, course?: string, limit = 8): Promise<(Note & { snippet: string; score: number })[]> {
  const terms = query.toLowerCase().split(/[^a-z0-9+\-/]+/).filter((t) => t.length > 1);
  const cs = course ? [course] : (await courses()).map((c) => c.name);
  const hits: (Note & { snippet: string; score: number })[] = [];
  for (const c of cs) {
    for (const n of await notesOf(c)) {
      const full = await fs.readFile(path.join(VAULT, n.rel), "utf8");
      const body = matter(full).content;
      const lower = `${n.name} ${n.topics.join(" ")} ${n.unit} ${body}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        const inTitle = n.name.toLowerCase().includes(t) || n.topics.some((x) => x.toLowerCase().includes(t));
        const count = lower.split(t).length - 1;
        score += (inTitle ? 5 : 0) + Math.min(count, 10);
      }
      if (score === 0) continue;
      const idx = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
      const at = Math.max(0, body.toLowerCase().indexOf(terms.find((t) => body.toLowerCase().includes(t)) ?? "", 0));
      hits.push({ ...n, score, snippet: body.slice(Math.max(0, at - 150), at + 350).replace(/\s+/g, " ").trim() || body.slice(0, 400) });
      void idx;
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Every note of a course (or unit), concatenated, capped. For "pull up all the problems on X". */
export async function readMany(course: string, unit?: string, maxChars = 60_000): Promise<{ text: string; included: number; total: number }> {
  const notes = await notesOf(course, unit);
  let text = "", included = 0;
  for (const n of notes) {
    const body = matter(await fs.readFile(path.join(VAULT, n.rel), "utf8")).content.trim();
    const chunk = `\n\n<note title="${n.name}" unit="${n.unit}" type="${n.type}" path="${n.rel}">\n${body}\n</note>`;
    if (text.length + chunk.length > maxChars) break;
    text += chunk; included++;
  }
  return { text, included, total: notes.length };
}

// ---- writes (the only two the app does) ----
export async function requestMaterial(course: string, unit: string, kind: "flashcards" | "test" | "review"): Promise<void> {
  const target = unit ? path.join(VAULT, COURSES, course, unit, "_Unit.md") : path.join(VAULT, COURSES, course, "_Course.md");
  if (!(await exists(target))) throw new Error("no such course or unit");
  await fs.appendFile(target, `\n#make-${kind}\n`);
}
export async function markRead(ids: string[]): Promise<void> {
  const p = path.join(VAULT, SYSTEM, "notifications.json");
  const list = await readJson<Notification[]>(`${SYSTEM}/notifications.json`, []);
  for (const n of list) if (ids.length === 0 || ids.includes(n.id)) n.read = true;
  await fs.writeFile(p, JSON.stringify(list, null, 2));
}
