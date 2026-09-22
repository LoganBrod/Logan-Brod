// The morning brief: one Claude call that reads the vault and tells you what today
// looks like. Written to 04 System/Brief.md and brief.json (the dashboard shows it),
// posted to Discord if a webhook is set.
//
//   npm run brief            write today's brief (skips if one exists for today)
//   npm run brief -- --force  rewrite it
import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
import { DIRS, MODEL_BRIEF } from "./config.js";
import { vaultPath, exists, readCourses, listCourseNotes, readNote, notify, appendLog } from "./vault.js";
import { recordUsage, money } from "./usage.js";

const force = process.argv.includes("--force");
const ifDue = process.argv.includes("--if-due");

export async function gatherState() {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = iso(today);
  const inDays = (n: number) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
  const readJson = async <T,>(rel: string, fb: T): Promise<T> => (await exists(vaultPath(rel))) ? JSON.parse(await fs.readFile(vaultPath(rel), "utf8")) : fb;

  const state = await readJson<Record<string, { title: string; when: string; kind: string; course?: string; description?: string }>>(`${DIRS.system}/schoology-state.json`, {});
  const upcoming = Object.values(state).filter((a) => a.when >= todayStr).sort((a, b) => a.when.localeCompare(b.when));
  const plan = await readJson<{ start: string; end: string; course: string; title: string; kind: string; when: string }[]>(`${DIRS.system}/study-plan.json`, []);
  const notifications = await readJson<{ time: string; kind: string; title: string }[]>(`${DIRS.system}/notifications.json`, []);
  const last = await readJson<{ date: string; time: string }>(`${DIRS.system}/brief.json`, { date: "", time: "1970-01-01T00:00:00Z" });
  const courses = await readCourses();

  // Weak topics from graded tests, per unit map
  const weak: string[] = [];
  for (const c of courses) {
    for (const p of await listCourseNotes(c.name)) if (p.endsWith("_Unit.md")) {
      const { body } = await readNote(p);
      const m = body.split(/^## Weak topics[^\n]*\n/m).slice(1).pop();
      if (m) weak.push(`${c.name}: ${m.split(/^## /m)[0].trim().split("\n").slice(0, 4).join("; ")}`);
    }
  }
  let inboxWaiting = 0;
  const inbox = vaultPath(DIRS.inbox);
  if (await exists(inbox)) for (const f of await fs.readdir(inbox)) if (f.endsWith(".md")) {
    const { data } = matter(await fs.readFile(`${inbox}/${f}`, "utf8"));
    if (data.status === "needs-review") inboxWaiting++;
  }

  return {
    todayStr,
    weekday: today.toLocaleDateString(undefined, { weekday: "long" }),
    testsSoon: upcoming.filter((a) => ["test", "quiz", "project"].includes(a.kind) && a.when <= inDays(10)),
    dueSoon: upcoming.filter((a) => a.kind === "assignment" && a.when <= inDays(2)),
    sessionsToday: plan.filter((s) => s.start.slice(0, 10) === todayStr),
    sessionsTomorrow: plan.filter((s) => s.start.slice(0, 10) === inDays(1)),
    newSinceLast: notifications.filter((n) => n.time > last.time).slice(0, 12),
    weak,
    inboxWaiting,
    lastBriefDate: last.date,
  };
}

async function main() {
  const s = await gatherState();
  if (!force && s.lastBriefDate === s.todayStr) {
    if (!ifDue) console.log("Today's brief already exists. Use --force to rewrite.");
    return;
  }
  if (ifDue && new Date().getHours() < 6) return; // wait for morning

  const facts = [
    `Today: ${s.weekday} ${s.todayStr}.`,
    `Tests/quizzes/projects in the next 10 days: ${s.testsSoon.map((a) => `${a.course ?? "?"} "${a.title}" (${a.kind}) on ${a.when}${a.description ? ` — teacher says: ${a.description.replace(/\s+/g, " ").slice(0, 240)}` : ""}`).join("; ") || "none"}.`,
    `Assignments due today or tomorrow: ${s.dueSoon.map((a) => `${a.course ?? "?"} "${a.title}" due ${a.when}`).join("; ") || "none"}.`,
    `Study sessions booked today: ${s.sessionsToday.map((x) => `${fmt(x.start)}-${fmt(x.end)} ${x.course} for "${x.title}"`).join("; ") || "none"}.`,
    `Tomorrow: ${s.sessionsTomorrow.map((x) => `${fmt(x.start)} ${x.course}`).join("; ") || "none"}.`,
    `New since the last brief: ${s.newSinceLast.map((n) => n.title).join("; ") || "nothing"}.`,
    `Known weak topics: ${s.weak.join(" | ") || "none recorded yet"}.`,
    `Notes waiting for the student to review in the inbox: ${s.inboxWaiting}.`,
  ].join("\n");

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL_BRIEF,
    max_tokens: 800,
    system: [{
      type: "text",
      text: `You write a high-school student's morning brief. Plain, direct, second person, no hype, no emojis, no em-dashes. 90 to 160 words. Markdown with exactly these headings, each followed by one to three short sentences or bullets: "## Today", "## Coming up", "## One thing". "One thing" is the single most useful action for today, specific (which deck, which test, which unit). If something new was posted overnight, say so under Today. If nothing is due and nothing is booked, say that in one line and suggest what to get ahead on. Never invent assignments, dates or topics that are not in the facts.`,
      cache_control: { type: "ephemeral" },
    }],
    messages: [{ role: "user", content: `Facts:\n${facts}` }],
  });
  const res = await stream.finalMessage();
  const cost = await recordUsage("brief", MODEL_BRIEF, s.todayStr, res.usage);
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

  const time = new Date().toISOString();
  await fs.writeFile(vaultPath(DIRS.system, "Brief.md"), matter.stringify(`# Brief for ${s.weekday}\n\n${text}\n`, { generated_by: "agent", date: s.todayStr }));
  await fs.writeFile(vaultPath(DIRS.system, "brief.json"), JSON.stringify({ date: s.todayStr, time, text }, null, 2));
  await notify("brief", `Morning brief for ${s.weekday}`, "04 System/Brief.md");
  await appendLog(`brief written for ${s.todayStr} (${money(cost)})`);
  if (process.env.DISCORD_WEBHOOK_URL) {
    await fetch(process.env.DISCORD_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: `**Brief for ${s.weekday}**\n${text.replace(/^## /gm, "**").replace(/^(\*\*[^\n]+)$/gm, "$1**")}` }) }).catch(() => {});
  }
  console.log(`${text}\n\n(${money(cost)})`);
}

const fmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

if (!process.argv.includes("--no-main")) main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
