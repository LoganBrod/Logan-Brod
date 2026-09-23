// The assistant's tools. Each one is a thin wrapper over what the brain and the vault
// already do, so the chat can only do things the rest of the system can do.
import "server-only";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";
import { courses, notesOf, readNote, searchNotes, readMany, tests, assessments, studyPlan, materials, requestMaterial, notesForAssessment, remember, VAULT } from "./vault";
import fs from "node:fs/promises";
import matter from "gray-matter";

const run = promisify(execFile);
const BRAIN_DIR = path.join(process.cwd(), "..");
const JOBS: Record<string, string[]> = {
  schoology: ["src/sync-schoology.ts"],
  materials: ["src/pull-materials.ts"],
  ingest: ["src/ingest.ts"],
  plan: ["src/plan-study.ts"],
  brief: ["src/brief.ts", "--force"],
  home: ["src/build-home.ts"],
};

export const tools: Anthropic.Tool[] = [
  {
    name: "list_courses",
    description: "The student's courses with their units and note counts. Call first when a request names a class loosely (e.g. 'calc' → 'Pre-calc').",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_notes",
    description: "Keyword search across the student's filed notes and teacher materials. Returns the best-matching notes with a snippet. Search several phrasings when a concept has synonyms (e.g. 'slope', 'rate of change', 'y2-y1', 'secant line').",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words or symbols to look for." },
        course: { type: "string", description: "Exact course name to restrict to, from list_courses. Optional." },
      },
      required: ["query"], additionalProperties: false,
    },
  },
  {
    name: "read_note",
    description: "Full text of one note by its path (from search_notes or list_notes).",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  },
  {
    name: "list_notes",
    description: "Titles, dates, types and topics of every note in a course, optionally one unit.",
    input_schema: { type: "object", properties: { course: { type: "string" }, unit: { type: "string" } }, required: ["course"], additionalProperties: false },
  },
  {
    name: "read_course_notes",
    description: "Every note in a course (or one unit) in full, up to a size cap. Use when the student wants everything on a topic pulled together, e.g. all the problems of a certain kind. Prefer a unit when you know it; it is cheaper.",
    input_schema: { type: "object", properties: { course: { type: "string" }, unit: { type: "string" } }, required: ["course"], additionalProperties: false },
  },
  {
    name: "upcoming",
    description: "Upcoming tests, quizzes, projects and assignments from Schoology, plus booked study sessions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "test_scope",
    description: "What a specific upcoming test, quiz or project covers: the teacher's full description from Schoology, and the notes from that course in the stretch leading up to it (since the previous assessment), in full. ALWAYS call this first when the student asks what to know, what to study, or what is on a test. Pass the assessment id from upcoming, or a title fragment.",
    input_schema: { type: "object", properties: { id: { type: "string", description: "Assessment id from upcoming, e.g. a:12345" }, title: { type: "string", description: "Part of the title, if the id is unknown" }, depth: { type: "string", enum: ["summary", "full"], description: "summary: description plus each in-scope note's title, topics and first lines (fast). full: every in-scope note in full (slow; for detailed study help in chat)." } }, additionalProperties: false },
  },
  {
    name: "study_material",
    description: "Existing flashcard decks, practice tests, reviews and graded tests, optionally for one course. Returns paths readable with read_note.",
    input_schema: { type: "object", properties: { course: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "make_material",
    description: "Generate flashcards, a practice test or a unit review right now from the notes of a course or unit. Takes 30 to 90 seconds and costs money; confirm the student wants it unless they asked explicitly. Returns the path of the new file.",
    input_schema: {
      type: "object",
      properties: { course: { type: "string" }, unit: { type: "string" }, kind: { type: "string", enum: ["flashcards", "test", "review"] } },
      required: ["course", "kind"], additionalProperties: false,
    },
  },
  {
    name: "open_page",
    description: "Open a screen in the app for the student ('pull up my physics notes', 'show me the week', 'open the study page for Thursday's quiz'). Returns the URL; the app navigates there. Use exact course names from list_courses and assessment ids from upcoming.",
    input_schema: {
      type: "object",
      properties: {
        where: { type: "string", enum: ["home", "notes", "course", "note", "study", "week", "inbox", "chat"] },
        course: { type: "string", description: "For where=course" },
        unit: { type: "string", description: "Optional unit filter for where=course" },
        path: { type: "string", description: "Vault path for where=note (from search_notes or study_material)" },
        assessment_id: { type: "string", description: "For where=study" },
      },
      required: ["where"], additionalProperties: false,
    },
  },
  {
    name: "remember",
    description: "Save a fact about the student for future conversations: preferences, schedule facts, goals, how they like to study, things they told you to remember. One short sentence. It is read before every reply from now on.",
    input_schema: { type: "object", properties: { fact: { type: "string" } }, required: ["fact"], additionalProperties: false },
  },
  {
    name: "run_job",
    description: "Run one of the brain's jobs now: 'schoology' (check for new tests and assignments), 'materials' (download new Schoology files), 'ingest' (file the inbox), 'plan' (rebook study sessions), 'brief' (rewrite today's brief), 'home'. Takes up to a couple of minutes.",
    input_schema: { type: "object", properties: { job: { type: "string", enum: Object.keys(JOBS) } }, required: ["job"], additionalProperties: false },
  },
];

export async function runTool(name: string, input: Record<string, unknown>): Promise<{ result: string; summary: string }> {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  switch (name) {
    case "list_courses": {
      const cs = await courses();
      return { result: JSON.stringify(cs.map((c) => ({ name: c.name, units: c.units, notes: c.noteCount }))), summary: "listed courses" };
    }
    case "search_notes": {
      const hits = await searchNotes(str("query") ?? "", str("course"));
      return {
        result: JSON.stringify(hits.map((h) => ({ path: h.rel, title: h.name, course: h.course, unit: h.unit, type: h.type, date: h.date, topics: h.topics, snippet: h.snippet }))),
        summary: `searched "${str("query")}" · ${hits.length} hit${hits.length === 1 ? "" : "s"}`,
      };
    }
    case "read_note": {
      const n = await readNote(str("path") ?? "");
      return n ? { result: n.body.slice(0, 40_000), summary: `read ${path.basename(n.rel, ".md")}` } : { result: "not found", summary: "note not found" };
    }
    case "list_notes": {
      const ns = await notesOf(str("course") ?? "", str("unit"));
      return { result: JSON.stringify(ns.map((n) => ({ path: n.rel, title: n.name, unit: n.unit, type: n.type, date: n.date, topics: n.topics }))), summary: `listed ${ns.length} notes in ${str("course")}` };
    }
    case "read_course_notes": {
      const r = await readMany(str("course") ?? "", str("unit"));
      return { result: r.text || "no notes", summary: `read ${r.included}/${r.total} notes from ${str("course")}${str("unit") ? " / " + str("unit") : ""}` };
    }
    case "upcoming": {
      const [as, plan] = await Promise.all([assessments(), studyPlan()]);
      return {
        result: JSON.stringify({ assessments: as.map((a) => ({ ...a, description: a.description?.slice(0, 300) })), sessions: plan.slice(0, 30) }),
        summary: "checked what's coming up",
      };
    }
    case "test_scope": {
      const as = await assessments();
      const id = str("id"), title = (str("title") ?? "").toLowerCase();
      const a = as.find((x) => x.id === id) ?? as.find((x) => title && x.title.toLowerCase().includes(title));
      if (!a) return { result: "no such upcoming assessment; call upcoming to see them", summary: "assessment not found" };
      const { notes, from, unit } = await notesForAssessment(a);
      const summary = str("depth") !== "full";
      let text = "", n = 0;
      for (const note of notes) {
        const body = summary ? note.excerpt : matter(await fs.readFile(path.join(VAULT, note.rel), "utf8")).content.trim();
        const chunk = summary
          ? `\n- "${note.name}" (${note.date}${note.unit ? `, ${note.unit}` : ""}, ${note.type}; topics: ${note.topics.join(", ") || "none"}; path: ${note.rel}): ${body}`
          : `\n\n<note title="${note.name}" date="${note.date}" unit="${note.unit}" type="${note.type}" path="${note.rel}">\n${body}\n</note>`;
        if (text.length + chunk.length > (summary ? 12_000 : 70_000)) break;
        text += chunk; n++;
      }
      const head = `ASSESSMENT: ${a.course} — ${a.title} (${a.kind}) on ${a.when}\nTEACHER'S DESCRIPTION:\n${a.description || "(none posted)"}\n\nNOTES IN SCOPE: ${n} of ${notes.length} (course notes dated ${from} to ${a.when}${unit ? `, plus unit "${unit}"` : ""}). Notes outside this window are NOT in scope unless the description points to them.`;
      return { result: head + (text || "\n\n(no notes filed in that window yet)"), summary: `scoped "${a.title}" · ${n} notes` };
    }
    case "study_material": {
      const ms = await materials(str("course"));
      return { result: JSON.stringify(ms.map((m) => ({ path: m.rel, kind: m.kind, name: m.name, course: m.course, unit: m.unit }))), summary: `listed ${ms.length} study files` };
    }
    case "make_material": {
      const kind = str("kind") ?? "flashcards", course = str("course") ?? "", unit = str("unit") ?? "";
      const { stdout } = await run("npx", ["tsx", "src/generate-study.ts", kind, course, ...(unit ? [unit] : [])], { cwd: BRAIN_DIR, timeout: 240_000, env: process.env });
      const wrote = stdout.match(/wrote (.+)/)?.[1]?.trim();
      return { result: wrote ? `created ${wrote}` : stdout.slice(-800), summary: `made ${kind} for ${course}${unit ? " / " + unit : ""}` };
    }
    case "open_page": {
      const where = str("where");
      const url =
        where === "home" ? "/" :
        where === "notes" ? "/courses" :
        where === "course" ? `/courses/${encodeURIComponent(str("course") ?? "")}${str("unit") ? `?unit=${encodeURIComponent(str("unit")!)}` : ""}` :
        where === "note" ? `/note/${encodeURI(str("path") ?? "")}` :
        where === "study" ? `/study/${(str("assessment_id") ?? "").replace(":", "-")}` :
        where === "week" ? "/week" : where === "inbox" ? "/notifications" : where === "chat" ? "/chat" : "/";
      return { result: JSON.stringify({ navigate: url }), summary: `opened ${where}` };
    }
    case "remember": {
      await remember(str("fact") ?? "");
      return { result: "remembered", summary: "remembered that" };
    }
    case "run_job": {
      const job = str("job") ?? "";
      if (!JOBS[job]) return { result: "unknown job", summary: "unknown job" };
      const { stdout } = await run("npx", ["tsx", ...JOBS[job]], { cwd: BRAIN_DIR, timeout: 300_000, env: process.env });
      return { result: stdout.slice(-3000), summary: `ran ${job}` };
    }
    default:
      return { result: "unknown tool", summary: "unknown tool" };
  }
}

export { tests, requestMaterial };
