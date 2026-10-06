// What a test covers, on the brain's side: the unit it belongs to and the notes in that unit,
// each with its type (slides, practice, past test, answer key...). The dashboard has the same
// logic for the assistant; this one feeds the planner and the brief.
import path from "node:path";
import { listCourseNotes, readNote, vaultPath, exists, type Course } from "./vault.js";
import fs from "node:fs/promises";
import matter from "gray-matter";

export type ScopedNote = { title: string; type: string; unit: string; path: string };
export type Scope = { course: Course | null; unit: string | null; guessed: boolean; notes: ScopedNote[]; decks: string[] };

const norm = (x: string) => (x ?? "").toLowerCase().replace(/[^a-z0-9㐀-鿿]/g, "");
const bare = (u: string) => u.toLowerCase().replace(/^(unit|chapter|ch\.?|topic|module)\s*\d+\s*[-:.]?\s*/, "").trim();
const num = (x: string) => x.match(/\b(?:unit|chapter|chap|ch|topic|module|test|exam)\s*#?\s*(\d+)\b/i)?.[1] ?? null;

export async function scopeFor(a: { course?: string; title: string; description?: string }, courses: Course[]): Promise<Scope> {
  const c = courses.find((x) => norm(x.name) === norm(a.course ?? "") || norm(x.name).startsWith(norm(a.course ?? "")) || norm(a.course ?? "").startsWith(norm(x.name))) ?? null;
  if (!c) return { course: null, unit: null, guessed: false, notes: [], decks: [] };
  const all: ScopedNote[] = [];
  for (const p of await listCourseNotes(c.name)) {
    const { data } = await readNote(p);
    if (String(data.type ?? "") === "course info") continue;
    all.push({ title: path.basename(p, ".md"), type: String(data.type ?? ""), unit: String(data.unit ?? ""), path: p });
  }
  const text = `${a.title} ${a.description ?? ""}`.toLowerCase();
  let unit = c.units.find((u) => text.includes(u.toLowerCase()) || (bare(u).length > 3 && text.includes(bare(u)))) ?? null;
  if (!unit) { const n = num(text); unit = n ? c.units.find((u) => num(u) === n || new RegExp(`\\b${n}\\b`).test(u)) ?? null : null; }
  let guessed = false;
  if (!unit && c.units.length) { unit = c.units.filter((u) => all.some((n) => n.unit === u)).at(-1) ?? null; guessed = !!unit; }
  const notes = unit ? all.filter((n) => n.unit === unit) : all;
  const decks: string[] = [];
  const deckDir = vaultPath("02 Study", "Flashcards");
  if (await exists(deckDir)) for (const f of await fs.readdir(deckDir)) {
    if (!f.endsWith(".md")) continue;
    const { data } = matter(await fs.readFile(path.join(deckDir, f), "utf8"));
    if (String(data.course) === c.name && (!unit || !data.unit || String(data.unit) === unit)) decks.push(f.slice(0, -3));
  }
  return { course: c, unit, guessed, notes, decks };
}

/** One concrete job per study session, in order, from what the unit actually contains. */
export function tasksFor(scope: Scope, count: number, kind: string): string[] {
  const by = (t: string) => scope.notes.filter((n) => n.type === t).map((n) => n.title);
  const reading = [...by("slides"), ...by("reading"), ...by("handout"), ...by("notes"), ...scope.notes.filter((n) => !n.type || n.type === "lecture").map((n) => n.title)];
  const practice = by("practice");
  const past = by("past test"), keys = by("answer key");
  const deck = scope.decks[0];
  const tasks: string[] = [];
  const unitName = scope.unit ?? "the unit";
  if (count <= 0) return tasks;
  // Last session: a dress rehearsal. Everything before it: read, then practise.
  const finale = past.length
    ? `Do "${past[0]}" timed, no notes${keys.length ? `, then check against "${keys[0]}"` : ""}. Write down every problem you missed and tell Jarvis the numbers.`
    : `Practice test for ${unitName} from the study page (ask Jarvis to make one if there is none)${deck ? `, then run the "${deck}" deck` : ""}. Tell Jarvis what you got wrong.`;
  const earlier = Math.max(0, count - 1);
  const readChunks = chunk(reading, earlier ? Math.ceil(reading.length / Math.max(1, Math.ceil(earlier / 2))) : reading.length);
  const pracChunks = chunk(practice, earlier ? Math.ceil(practice.length / Math.max(1, Math.floor(earlier / 2) || 1)) : practice.length);
  let r = 0, q = 0;
  for (let i = 0; i < earlier; i++) {
    const wantRead = i % 2 === 0 ? readChunks[r] : undefined;
    if (wantRead?.length) { tasks.push(`Read ${wantRead.map((t) => `"${t}"`).join(" and ")}; write the three ideas you would put on a cheat sheet.`); r++; continue; }
    const wantPrac = pracChunks[q];
    if (wantPrac?.length) { tasks.push(`Do the problems in ${wantPrac.map((t) => `"${t}"`).join(" and ")} without looking at the notes first${deck ? `; finish with the "${deck}" deck` : ""}.`); q++; continue; }
    if (readChunks[r]?.length) { tasks.push(`Read ${readChunks[r].map((t) => `"${t}"`).join(" and ")}; write the three ideas you would put on a cheat sheet.`); r++; continue; }
    tasks.push(deck ? `Run the "${deck}" deck twice; redo anything you flip wrong.` : `Re-read your notes for ${unitName} and make a one-page cheat sheet by hand.`);
  }
  tasks.push(kind === "quiz" && !past.length && practice.length ? `Redo ${practice.slice(0, 2).map((t) => `"${t}"`).join(" and ")} from a blank page, then check.` : finale);
  return tasks;
}

function chunk<T>(xs: T[], size: number): T[][] {
  if (!xs.length || size <= 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
