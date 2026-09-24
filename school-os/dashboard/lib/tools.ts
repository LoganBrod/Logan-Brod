// The assistant's tools. Each one is a thin wrapper over what the brain and the vault
// already do, so the chat can only do things the rest of the system can do.
import "server-only";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";
import { courses, notesOf, readNote, searchNotes, readMany, tests, assessments, studyPlan, materials, requestMaterial, notesForAssessment, remember, MODE } from "./vault";
import { store } from "./store";
import { driveConfigured, searchDocs, readDoc, docIdFromUrl } from "./gdrive";
import matter from "gray-matter";

/** Something to put on the student's Desk: a tab the app keeps until they close it. */
export type ShowItem = { id: string; kind: "note" | "doc" | "deck" | "text"; title: string; subtitle?: string; body: string; url?: string };

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

const allTools: Anthropic.Tool[] = [
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
    name: "show",
    description: "Put one thing on the student's Desk, a panel of tabs beside the page: a note (path from search_notes/list_notes), a study file (path from study_material; flashcard decks become a flippable deck), a Google Doc (id from google_docs), or text you write yourself (a practice set, a summary, worked steps) with a title. The student can keep several tabs open. Prefer this over open_page for a single document; use open_page for whole screens like the week or a course.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["note", "material", "doc", "text"] },
        path: { type: "string", description: "Vault path, for note and material" },
        id: { type: "string", description: "Google Doc id or link, for doc" },
        title: { type: "string", description: "Tab title, required for text" },
        body: { type: "string", description: "Markdown, for text" },
      },
      required: ["kind"], additionalProperties: false,
    },
  },
  {
    name: "google_docs",
    description: "The student's Google Docs, live. 'recent' lists the newest; 'search' matches words in titles and text; 'read' returns one doc as markdown. Docs already filed as notes are in search_notes too, so search notes first and use this for docs that are not filed yet or when the latest version matters. Only works when Google Docs are connected.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["recent", "search", "read"] },
        query: { type: "string", description: "For search" },
        id: { type: "string", description: "Doc id or link, for read" },
      },
      required: ["action"], additionalProperties: false,
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

// On Vercel the brain is not here, so nothing can be run on the spot. make_material still works:
// it leaves the tag for the Mac to act on.
export const tools = MODE === "cloud" ? allTools.filter((t) => t.name !== "run_job") : allTools;

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
        const body = summary ? note.excerpt : matter(await store.readFile(note.rel)).content.trim();
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
      if (MODE === "cloud") {
        await requestMaterial(course, unit, kind === "test" || kind === "review" ? kind : "flashcards");
        return { result: `queued: the computer at home makes the ${kind} on its next sync, within about 30 minutes, and it will show up under Study`, summary: `queued ${kind} for ${course}` };
      }
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
    case "show": {
      const item = await toShow(str("kind") ?? "", str("path"), str("id"), str("title"), str("body"));
      return { result: JSON.stringify({ shown: item.title, kind: item.kind, chars: item.body.length, preview: item.body.slice(0, 1200), show: item }), summary: `showed ${item.title}` };
    }
    case "google_docs": {
      if (!driveConfigured()) return { result: "Google Docs are not connected. README → Google Docs: a service account key in GOOGLE_SERVICE_ACCOUNT_KEY and the docs shared with its email.", summary: "Google Docs not connected" };
      const action = str("action");
      if (action === "read") {
        const id = docIdFromUrl(str("id") ?? "");
        if (!id) return { result: "give the doc id or link from a search", summary: "no doc id" };
        const d = await readDoc(id);
        return { result: `<doc title="${d.name}" id="${d.id}" modified="${d.modified}">\n${d.body}\n</doc>`, summary: `read Google Doc ${d.name}` };
      }
      const docs = await searchDocs(action === "search" ? str("query") ?? "" : "", 12);
      return { result: docs.length ? JSON.stringify(docs) : "no matching Google Docs (are they shared with the service account?)", summary: action === "search" ? `searched Google Docs for "${str("query")}" · ${docs.length}` : `listed ${docs.length} recent Google Docs` };
    }
    case "remember": {
      await remember(str("fact") ?? "");
      return { result: "remembered", summary: "remembered that" };
    }
    case "run_job": {
      const job = str("job") ?? "";
      if (!JOBS[job]) return { result: "unknown job", summary: "unknown job" };
      if (MODE === "cloud") return { result: "jobs run on the computer at home on their 30-minute schedule; they cannot be started from here", summary: "job not available here" };
      const { stdout } = await run("npx", ["tsx", ...JOBS[job]], { cwd: BRAIN_DIR, timeout: 300_000, env: process.env });
      return { result: stdout.slice(-3000), summary: `ran ${job}` };
    }
    default:
      return { result: "unknown tool", summary: "unknown tool" };
  }
}

async function toShow(kind: string, p?: string, id?: string, title?: string, body?: string): Promise<ShowItem> {
  if (kind === "text") {
    if (!title || !body) throw new Error("text needs a title and a body");
    return { id: `text:${Date.now()}`, kind: "text", title: title.slice(0, 80), body };
  }
  if (kind === "doc") {
    const docId = docIdFromUrl(id ?? "");
    if (!docId) throw new Error("doc needs an id or link from google_docs");
    const d = await readDoc(docId);
    return { id: `doc:${d.id}`, kind: "doc", title: d.name, subtitle: `Google Doc · edited ${d.modified}`, body: d.body, url: d.url };
  }
  const n = await readNote(p ?? "");
  if (!n) throw new Error(`no note at ${p}`);
  const name = path.basename(n.rel, ".md");
  const gdoc = typeof n.data.gdoc_id === "string" ? `https://docs.google.com/document/d/${n.data.gdoc_id}/edit` : undefined;
  const isDeck = /Flashcards\//.test(n.rel) || n.body.includes("#flashcards");
  const parts = [n.data.course, n.data.unit, n.data.type].filter((x) => typeof x === "string" && x).join(" · ");
  return { id: `note:${n.rel}`, kind: isDeck ? "deck" : "note", title: name, subtitle: parts || undefined, body: n.body, url: gdoc };
}

export { tests, requestMaterial };
