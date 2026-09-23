// Server-only reads of the vault. Same folder layout the brain writes to. Every path is
// vault-relative and goes through `store`, which is the local folder or the copy on Vercel.
import "server-only";
import matter from "gray-matter";
import { store, join, MODE, VAULT } from "./store";

export { MODE, VAULT };
const COURSES = "01 Courses", STUDY = "02 Study", SYSTEM = "04 System", INBOX = "00 Inbox";

export type Note = {
  rel: string; name: string; course: string; unit: string; type: string; date: string;
  topics: string[]; excerpt: string; sourceKind: string; status: string; mtime: number;
};
export type Course = { name: string; units: string[]; hue: number; noteCount: number };
export type Assessment = { id: string; title: string; when: string; kind: string; course: string; description?: string; url?: string };
export type Session = { start: string; end: string; label: string; course: string; title: string; kind: string; when: string; id: string };
export type Notification = { id: string; time: string; kind: string; title: string; link: string | null; read: boolean };

/** Schoology ids look like "a:123"; a colon in a URL segment never reaches a Next.js page. */
export const idToSlug = (id: string) => id.replace(":", "-");
export const slugToId = (slug: string) => slug.replace("-", ":");
export const hueOf = (name: string) => [250, 150, 30, 330, 200, 80, 300][[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 7];
export const today = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (d: string) => Math.round((Date.parse(d) - Date.parse(today())) / 86_400_000);

const exists = (rel: string) => store.exists(rel);
async function readJson<T>(rel: string, fallback: T): Promise<T> {
  try { return JSON.parse(await store.readFile(rel)); } catch { return fallback; }
}

export async function courses(): Promise<Course[]> {
  const out: Course[] = [];
  for (const e of await store.readdir(COURSES)) {
    if (!e.dir) continue;
    const card = join(COURSES, e.name, "_Course.md");
    if (!(await exists(card))) continue;
    const { data } = matter(await store.readFile(card));
    const units = Array.isArray(data.units) ? data.units.map(String).filter(Boolean) : [];
    out.push({ name: e.name, units, hue: hueOf(e.name), noteCount: (await notesOf(e.name)).length });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function notesOf(course: string, unit?: string): Promise<Note[]> {
  if (!course) return [];
  const root = unit ? join(COURSES, course, unit) : join(COURSES, course);
  if (!(await exists(root))) return [];
  const out: Note[] = [];
  async function walk(dir: string) {
    for (const e of await store.readdir(dir)) {
      const full = join(dir, e.name);
      if (e.dir) { if (!e.name.startsWith("_") && !e.name.startsWith(".")) await walk(full); continue; }
      if (!e.name.endsWith(".md") || e.name.startsWith("_")) continue;
      const raw = await store.readFile(full);
      const { data, content } = matter(raw);
      out.push({
        rel: full, name: e.name.slice(0, -3), course,
        unit: String(data.unit ?? ""), type: String(data.type ?? ""), date: dateStr(data.date),
        topics: Array.isArray(data.topics) ? data.topics.map(String) : [],
        excerpt: content.replace(/^#.*$/gm, "").replace(/[*_`>#\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 220),
        sourceKind: String(data.source_kind ?? ""), status: String(data.status ?? ""), mtime: await store.mtime(full),
      });
    }
  }
  await walk(root);
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime);
}

export async function readNote(rel: string): Promise<{ data: Record<string, unknown>; body: string; rel: string } | null> {
  const full = join(rel);
  if (!full || full.startsWith("..") || !(await exists(full))) return null;
  const { data, content } = matter(await store.readFile(full));
  return { data, body: content, rel: full };
}

/** Resolve an Obsidian [[wikilink]] (basename) to a vault-relative path, if it exists. */
export async function resolveLink(name: string): Promise<string | null> {
  const target = name.split("|")[0].split("#")[0].trim();
  const hits = await findFiles("", (f) => f === `${target}.md` || f === target);
  return hits[0] ?? null;
}

async function findFiles(dir: string, pred: (name: string) => boolean, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const out: string[] = [];
  for (const e of await store.readdir(dir)) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "_sources") continue;
    const full = join(dir, e.name);
    if (e.dir) out.push(...(await findFiles(full, pred, depth + 1)));
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
  let n = 0;
  for (const { name: f, dir } of await store.readdir(INBOX)) {
    if (dir || !f.endsWith(".md")) continue;
    const { data } = matter(await store.readFile(join(INBOX, f)));
    if (data.status === "needs-review") n++;
  }
  return n;
}

export type Material = { kind: "flashcards" | "test" | "review" | "graded"; rel: string; name: string; course: string; unit: string };
export async function materials(course?: string): Promise<Material[]> {
  const out: Material[] = [];
  for (const [dir, kind] of [["Flashcards", "flashcards"], ["Practice Tests", "test"], ["Unit Reviews", "review"]] as const) {
    const full = join(STUDY, dir);
    for (const { name: f, dir: isDir } of await store.readdir(full)) {
      if (isDir || !f.endsWith(".md")) continue;
      const { data } = matter(await store.readFile(join(full, f)));
      if (course && String(data.course) !== course) continue;
      out.push({ kind: f.includes("Graded") ? "graded" : kind, rel: join(STUDY, dir, f), name: f.slice(0, -3), course: String(data.course ?? ""), unit: String(data.unit ?? "") });
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

const DEFAULT_PERSONA = `You are Jarvis, a personal assistant modeled on the one from the Iron Man films: calm, precise, unflappable, quietly witty. Address the student as "sir" now and then or by first name, not every sentence. Understated, dry, short sentences, no exclamation marks, no emojis, no em-dashes. Say the thing, then stop. Honest over confident. Offer brief opinions. You can chat like a companion who knows them, then steer back to what helps.`;

export async function persona(): Promise<string> {
  const p = join(SYSTEM, "persona.md");
  if (!(await exists(p))) return DEFAULT_PERSONA;
  const body = matter(await store.readFile(p)).content.replace(/^# Persona[^\n]*\n+[\s\S]*?(?=## )/, "").trim();
  return body || DEFAULT_PERSONA;
}
export async function memory(): Promise<string> {
  const p = join(SYSTEM, "memory.md");
  if (!(await exists(p))) return "";
  return (await store.readFile(p)).split("\n").filter((l) => l.startsWith("- ")).slice(-60).join("\n");
}
export async function remember(text: string): Promise<void> {
  const p = join(SYSTEM, "memory.md");
  if (!(await exists(p))) await store.writeFile(p, "# Memory\n\nThings the assistant has been asked to remember.\n\n");
  await store.appendFile(p, `- ${new Date().toISOString().slice(0, 10)}: ${text.trim().replace(/\s+/g, " ")}\n`);
}

export const brief = () => readJson<{ date: string; time: string; text: string } | null>(`${SYSTEM}/brief.json`, null);

/** Keyword search across every filed note: title, topics, unit, body. Scores by term hits. */
export async function searchNotes(query: string, course?: string, limit = 8): Promise<(Note & { snippet: string; score: number })[]> {
  // Letters and numbers in any script. Chinese has no spaces, so also index 2-character pieces of any CJK run.
  const raw = query.toLowerCase().split(/[^\p{L}\p{N}+\-/]+/u).filter(Boolean);
  const terms = raw.flatMap((t) => {
    if (!/[\u3400-\u9fff]/.test(t)) return t.length > 1 ? [t] : [];
    const parts = [t];
    for (let i = 0; i + 2 <= t.length; i++) parts.push(t.slice(i, i + 2));
    return parts;
  });
  const cs = course ? [course] : (await courses()).map((c) => c.name);
  const hits: (Note & { snippet: string; score: number })[] = [];
  for (const c of cs) {
    for (const n of await notesOf(c)) {
      const body = matter(await store.readFile(n.rel)).content;
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

/** The notes that a test most plausibly covers: same course, dated in the stretch since the previous
 *  assessment in that course (at least 14, at most 45 days before), plus anything in a unit the test names. */
export async function notesForAssessment(a: Assessment): Promise<{ notes: Note[]; from: string; unit: string | null }> {
  const all = await assessments();
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cs = await courses();
  const c = cs.find((x) => norm(x.name) === norm(a.course) || norm(x.name).startsWith(norm(a.course)) || norm(a.course).startsWith(norm(x.name)));
  if (!c) return { notes: [], from: "", unit: null };
  const prev = all.filter((x) => x.course === a.course && ["test", "quiz", "project"].includes(x.kind) && x.when < a.when).map((x) => x.when).sort().pop();
  const when = new Date(a.when + "T12:00:00");
  const floor = new Date(when); floor.setDate(floor.getDate() - 45);
  const cap = new Date(when); cap.setDate(cap.getDate() - 14);
  let from = prev ? new Date(prev + "T12:00:00") : cap;
  if (from > cap) from = cap; if (from < floor) from = floor;
  const fromStr = from.toISOString().slice(0, 10);
  const text = `${a.title} ${a.description ?? ""}`.toLowerCase();
  const unit = c.units.find((u) => text.includes(u.toLowerCase()) || text.includes(u.toLowerCase().replace(/^unit \d+\s*-\s*/, ""))) ?? null;
  const notes = (await notesOf(c.name)).filter((n) => (n.date && n.date >= fromStr && n.date <= a.when) || (unit && n.unit === unit));
  return { notes, from: fromStr, unit };
}

/** Every note of a course (or unit), concatenated, capped. For "pull up all the problems on X". */
export async function readMany(course: string, unit?: string, maxChars = 60_000): Promise<{ text: string; included: number; total: number }> {
  const notes = await notesOf(course, unit);
  let text = "", included = 0;
  for (const n of notes) {
    const body = matter(await store.readFile(n.rel)).content.trim();
    const chunk = `\n\n<note title="${n.name}" unit="${n.unit}" type="${n.type}" path="${n.rel}">\n${body}\n</note>`;
    if (text.length + chunk.length > maxChars) break;
    text += chunk; included++;
  }
  return { text, included, total: notes.length };
}

// ---- writes (the only two the app does) ----
export async function requestMaterial(course: string, unit: string, kind: "flashcards" | "test" | "review"): Promise<void> {
  const target = unit ? join(COURSES, course, unit, "_Unit.md") : join(COURSES, course, "_Course.md");
  if (!(await exists(target))) throw new Error("no such course or unit");
  await store.appendFile(target, `\n#make-${kind}\n`);
}
export async function markRead(ids: string[]): Promise<void> {
  const p = join(SYSTEM, "notifications.json");
  const list = await readJson<Notification[]>(p, []);
  for (const n of list) if (ids.length === 0 || ids.includes(n.id)) n.read = true;
  await store.writeFile(p, JSON.stringify(list, null, 2));
}
