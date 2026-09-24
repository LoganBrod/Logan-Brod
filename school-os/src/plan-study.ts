// Books study sessions into a "Study" Google Calendar for every upcoming test,
// quiz and project, around what is already on your main calendar and inside the
// hours you set in 04 System/study-rules.md. Rewrites 03 Calendar/Study Plan.md.
//
//   npm run plan          book sessions (re-plans from scratch; only touches its own events)
//   npm run plan:dry      print the plan, change nothing
//
// Every event it creates carries "[school-os:<id>]" in its description. On each run it
// deletes its own events for that assessment and places fresh ones, so rerunning is safe.
import fs from "node:fs/promises";
import { google, type calendar_v3 } from "googleapis";
import ical, { type VEvent } from "node-ical";
import matter from "gray-matter";
import { DIRS, GOOGLE_SERVICE_ACCOUNT_KEY } from "./config.js";
import { vaultPath, exists, readCourses, appendLog, notify, listCourseNotes, type Course } from "./vault.js";

const dryRun = process.argv.includes("--dry-run");
const ifConfigured = process.argv.includes("--if-configured");
/** Accepts a bare calendar ID or the embed link Google shows next to it (pulls the src= out). */
function calendarId(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  const m = v.match(/[?&]src=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : v;
}
const MAIN_CAL = calendarId(process.env.GOOGLE_CALENDAR_ID);
/** Fallback for calendars that cannot be shared (school accounts): the calendar's secret iCal address. */
const BUSY_ICAL_URL = (process.env.BUSY_ICAL_URL ?? "").trim();
const STUDY_CAL = calendarId(process.env.STUDY_CALENDAR_ID);

type Assessment = { id: string; title: string; when: string; kind: "test" | "quiz" | "project"; course: string };
type Rules = {
  windows: Record<string, string[]>; // weekday | saturday | sunday | monday... → ["16:00-21:30"]
  never: string[];                   // ["friday 18:00-23:59"]
  max_hours_per_day: number;
  session_minutes: number;
  buffer_minutes: number;
  days_ahead: number;
};
type Slot = { start: Date; end: Date };
type Session = Slot & { a: Assessment; label: string };

const DEFAULT_RULES: Rules = {
  windows: { weekday: ["16:00-21:30"], saturday: ["10:00-18:00"], sunday: ["12:00-20:00"] },
  never: ["friday 18:00-23:59"],
  max_hours_per_day: 2,
  session_minutes: 45,
  buffer_minutes: 30,
  days_ahead: 21,
};
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function main() {
  if (!GOOGLE_SERVICE_ACCOUNT_KEY || !STUDY_CAL) {
    if (ifConfigured) { console.log("Planner not set up yet (no STUDY_CALENDAR_ID); skipping."); return; }
    throw new Error("Set GOOGLE_SERVICE_ACCOUNT_KEY and STUDY_CALENDAR_ID in .env (see README → Study planner).");
  }
  const rules = await loadRules();
  const courses = await readCourses();
  const today = startOfDay(new Date());
  const horizon = addDays(today, rules.days_ahead);

  // What to study for
  const statePath = vaultPath(DIRS.system, "schoology-state.json");
  const state: Record<string, Assessment> = (await exists(statePath)) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};
  const upcoming = Object.entries(state)
    .map(([id, a]) => ({ ...a, id, course: a.course ?? "" }))
    .filter((a) => ["test", "quiz", "project"].includes(a.kind) && a.when > isoDate(today) && a.when <= isoDate(horizon))
    .sort((x, y) => x.when.localeCompare(y.when));
  if (upcoming.length === 0) { console.log("Nothing to plan for in the next " + rules.days_ahead + " days."); await writePlan([], rules); return; }

  // Calendar
  const auth = new google.auth.GoogleAuth({ keyFile: GOOGLE_SERVICE_ACCOUNT_KEY, scopes: ["https://www.googleapis.com/auth/calendar"] });
  const cal = google.calendar({ version: "v3", auth });
  const timeMin = today.toISOString(), timeMax = addDays(horizon, 1).toISOString();

  // Check access to each calendar first, so a bad ID or missing share says which one.
  for (const [label, id, need] of [["STUDY_CALENDAR_ID", STUDY_CAL, "Make changes to events"], ["GOOGLE_CALENDAR_ID", MAIN_CAL, "See all event details"]] as const) {
    if (!id) continue;
    try {
      const c = await cal.calendarList.get({ calendarId: id }).catch(() => cal.calendars.get({ calendarId: id }));
      console.log(`${label}: ok (${c.data.summary ?? id})`);
    } catch {
      throw new Error(
        `${label} (${id}) is not reachable by the service account.\n` +
        `  Check: the ID is the one under Settings → Integrate calendar, and the calendar is shared with the service account email with "${need}".`,
      );
    }
  }

  const busy: Slot[] = [];
  if (BUSY_ICAL_URL) {
    const n = busy.push(...(await icalBusy(BUSY_ICAL_URL, today, addDays(horizon, 1))));
    console.log(`BUSY_ICAL_URL: ok (${n} busy block(s) in the window)`);
  }
  const calendars = [MAIN_CAL, STUDY_CAL].filter(Boolean);
  const fb = await cal.freebusy.query({ requestBody: { timeMin, timeMax, items: calendars.map((id) => ({ id })) } });
  for (const id of calendars) for (const b of fb.data.calendars?.[id]?.busy ?? []) busy.push({ start: new Date(b.start!), end: new Date(b.end!) });

  // Our own existing sessions: remove them from "busy" (we re-plan them) and delete later
  const ours = (await cal.events.list({ calendarId: STUDY_CAL, timeMin, timeMax, singleEvents: true, maxResults: 500, q: "[school-os:" })).data.items ?? [];
  const oursById: Record<string, calendar_v3.Schema$Event[]> = {};
  for (const e of ours) {
    const m = e.description?.match(/\[school-os:([^\]]+)\]/);
    if (!m) continue;
    (oursById[m[1]] ??= []).push(e);
    if (e.start?.dateTime && e.end?.dateTime) {
      const i = busy.findIndex((b) => b.start.getTime() === new Date(e.start!.dateTime!).getTime());
      if (i >= 0) busy.splice(i, 1);
    }
  }

  const noteCounts: Record<string, number> = {};
  for (const c of courses) noteCounts[c.name] = (await listCourseNotes(c.name)).length;
  const placed = placeSessions(upcoming, rules, busy, courses, noteCounts, today);

  // Report
  console.log(`\nPlanned ${placed.length} session(s) for ${upcoming.length} assessment(s):`);
  for (const s of [...placed].sort((x, y) => x.start.getTime() - y.start.getTime()))
    console.log(`  ${fmt(s.start)} – ${fmtTime(s.end)}  ${s.label}`);
  if (dryRun) { console.log("\nDry run: calendar untouched."); return; }

  // Write: delete our old events for these assessments, insert the new ones
  let deleted = 0;
  for (const a of upcoming) for (const e of oursById[a.id] ?? []) { await cal.events.delete({ calendarId: STUDY_CAL, eventId: e.id! }); deleted++; }
  for (const s of placed) {
    await cal.events.insert({
      calendarId: STUDY_CAL,
      requestBody: {
        summary: s.label,
        description: `${s.a.kind} on ${s.a.when}. Open the study page for this unit, run flashcards, then a practice test.\n[school-os:${s.a.id}]`,
        start: { dateTime: s.start.toISOString() },
        end: { dateTime: s.end.toISOString() },
        colorId: s.a.kind === "test" ? "11" : s.a.kind === "quiz" ? "5" : "9",
      },
    });
  }
  await writePlan(placed, rules);
  await appendLog(`planner: ${placed.length} sessions booked (${deleted} old ones replaced) for ${upcoming.length} assessments`);
  await notify("study_generated", `Study plan: ${placed.length} sessions booked`, "03 Calendar/Study Plan.md");
  console.log(`\nBooked ${placed.length} sessions (replaced ${deleted}). See 03 Calendar/Study Plan.md.`);
}

/** Busy blocks from an iCal feed, recurring events expanded. */
async function icalBusy(url: string, from: Date, to: Date): Promise<Slot[]> {
  const data = await ical.async.fromURL(url);
  const out: Slot[] = [];
  for (const item of Object.values(data)) {
    if (!item || item.type !== "VEVENT") continue;
    const ev = item as VEvent;
    if (!ev.start || !ev.end) continue;
    if (ev.datetype === "date") continue; // all-day events do not block study time
    const len = ev.end.getTime() - ev.start.getTime();
    const starts: Date[] = ev.rrule ? ev.rrule.between(from, to, true) : [ev.start];
    const skip = new Set(Object.keys(ev.exdate ?? {}));
    for (const st of starts) {
      if (skip.has(st.toISOString().slice(0, 10))) continue;
      if (st < from || st > to) continue;
      out.push({ start: st, end: new Date(st.getTime() + len) });
    }
  }
  return out;
}

/** Pure placement: nearest assessment first, sessions walk back from the day before it. */
export type { Assessment, Rules, Slot, Session };
export { DEFAULT_RULES };
export function placeSessions(
  upcoming: Assessment[], rules: Rules, busy: Slot[], courses: Course[], noteCounts: Record<string, number>, today: Date,
): Session[] {
  const placed: Session[] = [];
  const minutesOnDay = (d: Date) => placed.filter((s) => sameDay(s.start, d)).reduce((m, s) => m + (s.end.getTime() - s.start.getTime()) / 60000, 0);
  const norm = (x: string) => (x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const a of upcoming) {
    const course = courses.find((c) => norm(c.name) === norm(a.course) || norm(c.name).startsWith(norm(a.course)) || norm(a.course).startsWith(norm(c.name)));
    const hours = Number(course?.study_hours?.[a.kind === "project" ? "test" : a.kind] ?? (a.kind === "quiz" ? 1.5 : 4));
    const noteCount = course ? noteCounts[course.name] ?? 0 : 0;
    const need = Math.max(1, Math.round((hours * 60 * (noteCount > 20 ? 1.25 : 1)) / rules.session_minutes));
    const testDay = startOfDay(new Date(a.when + "T12:00:00"));
    const lastDay = addDays(testDay, -1);
    const firstDay = addDays(today, 1);
    let got = 0;
    // Pass 1: one session per day walking back from the eve of the test, so the last days are covered.
    // Pass 2: a second session on days that still have room.
    for (const pass of [1, 2]) {
      for (let d = lastDay; d >= firstDay && got < need; d = addDays(d, -1)) {
        if (pass === 1 && placed.some((s) => s.a.id === a.id && sameDay(s.start, d))) continue;
        const slot = findSlot(d, rules, busy, minutesOnDay);
        if (!slot) continue;
        placed.push({ ...slot, a, label: `Study: ${a.course} — ${a.title}` });
        busy.push(slot);
        got++;
      }
    }
    if (got < need) console.log(`  could only fit ${got}/${need} session(s) for ${a.course}: ${a.title}`);
  }
  return placed;
}

function findSlot(day: Date, rules: Rules, busy: Slot[], minutesOnDay: (d: Date) => number): Slot | null {
  if (minutesOnDay(day) + rules.session_minutes > rules.max_hours_per_day * 60) return null;
  const name = DAY_NAMES[day.getDay()];
  const windows = rules.windows[name] ?? (day.getDay() === 0 || day.getDay() === 6 ? [] : rules.windows.weekday) ?? [];
  const nevers = rules.never.filter((n) => n.toLowerCase().startsWith(name)).map((n) => n.split(/\s+/)[1]);
  const buf = rules.buffer_minutes * 60000, len = rules.session_minutes * 60000;
  for (const w of windows) {
    const [ws, we] = w.split("-").map((t) => at(day, t));
    for (let t = ws.getTime(); t + len <= we.getTime(); t += 15 * 60000) {
      const s = new Date(t), e = new Date(t + len);
      if (nevers.some((n) => { const [ns, ne] = n.split("-").map((x) => at(day, x)); return s < ne && e > ns; })) continue;
      if (busy.some((b) => s.getTime() < b.end.getTime() + buf && e.getTime() > b.start.getTime() - buf)) continue;
      if (s.getTime() < Date.now()) continue;
      return { start: s, end: e };
    }
  }
  return null;
}

async function loadRules(): Promise<Rules> {
  const p = vaultPath(DIRS.system, "study-rules.md");
  if (!(await exists(p))) return DEFAULT_RULES;
  const { data } = matter(await fs.readFile(p, "utf8"));
  if (!data.windows) { console.log("study-rules.md has no settings block; using defaults (see README)."); return DEFAULT_RULES; }
  return { ...DEFAULT_RULES, ...data } as Rules;
}

async function writePlan(placed: Session[], rules: Rules) {
  const byDay: Record<string, Session[]> = {};
  for (const s of placed) (byDay[isoDate(s.start)] ??= []).push(s);
  const lines = ["# Study plan", "", `_Booked by the planner on ${new Date().toISOString().slice(0, 16).replace("T", " ")}. Sessions of ${rules.session_minutes} min, max ${rules.max_hours_per_day} h/day. Edit \`study-rules.md\` to change the rules._`, ""];
  if (!placed.length) lines.push("Nothing planned. No tests, quizzes or projects in the window.");
  for (const day of Object.keys(byDay).sort()) {
    lines.push(`## ${new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`, "");
    for (const s of byDay[day].sort((x, y) => x.start.getTime() - y.start.getTime()))
      lines.push(`- ${fmtTime(s.start)}–${fmtTime(s.end)} · **${s.a.course}** · ${s.a.title} _(${s.a.kind} on ${s.a.when})_`);
    lines.push("");
  }
  await fs.writeFile(vaultPath("03 Calendar", "Study Plan.md"), matter.stringify(lines.join("\n"), { generated_by: "agent" }));
  await fs.writeFile(
    vaultPath(DIRS.system, "study-plan.json"),
    JSON.stringify(placed.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), label: s.label, course: s.a.course, title: s.a.title, kind: s.a.kind, when: s.a.when, id: s.a.id })), null, 2),
  );
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (day: Date, hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m); };
const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmt = (d: Date) => d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

if (!process.argv.includes("--no-main")) main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
