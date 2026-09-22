// Pulls every assignment and event from your Schoology sections, works out
// which ones are tests, and keeps 03 Calendar/Upcoming Tests.md current.
// New tests get a Discord ping if DISCORD_WEBHOOK_URL is set.
//
//   npm run schoology:whoami   check the credentials, list your classes
//   npm run schoology          sync
//   npm run schoology:dry      show what would change, write nothing
import fs from "node:fs/promises";
import { DIRS } from "./config.js";
import { vaultPath, exists, appendLog, notify } from "./vault.js";
import { me, mySections, sectionAssignments, sectionEvents } from "./schoology.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const whoami = args.has("--whoami");

type Kind = "test" | "quiz" | "project" | "assignment" | "event";

type Item = {
  id: string; // "a:<assignment id>" or "e:<event id>"
  course: string;
  title: string;
  kind: Kind;
  when: string; // YYYY-MM-DD
  url?: string;
};

type State = Record<string, { title: string; when: string; kind: Kind; seen: string }>;

/** Teachers name things inconsistently. Schoology's own "assessment" type plus a few words cover most of it. */
function classify(title: string, type: string | undefined, description = ""): Kind {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(final|midterm|exam|test|unit assessment)\b/.test(text)) return "test";
  if (/\bquiz(zes)?\b/.test(text)) return "quiz";
  if (type === "assessment") return "test";
  if (/\b(project|essay|paper|presentation)\b/.test(text)) return "project";
  return type === "event" ? "event" : "assignment";
}

function day(stamp: string | undefined): string | null {
  if (!stamp) return null;
  const m = stamp.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function main() {
  const who = await me();
  const sections = await mySections(who.uid);
  console.log(`Signed in as ${who.name_display}. ${sections.length} classes:`);
  for (const s of sections) console.log(`  ${s.course_title} · ${s.section_title} (id ${s.id})`);
  if (whoami) return;

  const today = new Date().toISOString().slice(0, 10);
  const items: Item[] = [];
  for (const s of sections) {
    const course = s.course_title;
    for (const a of await sectionAssignments(s.id)) {
      const when = day(a.due);
      if (!when || when < today) continue;
      items.push({ id: `a:${a.id}`, course, title: a.title, kind: classify(a.title, a.type, a.description), when, url: a.web_url });
    }
    for (const e of await sectionEvents(s.id)) {
      const when = day(e.start);
      if (!when || when < today) continue;
      if (e.type === "assignment") continue; // already covered above
      items.push({ id: `e:${e.id}`, course, title: e.title, kind: classify(e.title, "event", e.description), when, url: e.web_url });
    }
  }
  items.sort((x, y) => x.when.localeCompare(y.when) || x.course.localeCompare(y.course));

  const statePath = vaultPath(DIRS.system, "schoology-state.json");
  const state: State = (await exists(statePath)) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};
  const fresh = items.filter((i) => !state[i.id]);
  const moved = items.filter((i) => state[i.id] && state[i.id].when !== i.when);

  console.log(`\n${items.length} upcoming items, ${fresh.length} new, ${moved.length} rescheduled.`);
  for (const i of fresh) console.log(`  NEW   ${i.when}  ${i.kind.padEnd(10)} ${i.course}: ${i.title}`);
  for (const i of moved) console.log(`  MOVED ${i.when}  ${i.kind.padEnd(10)} ${i.course}: ${i.title} (was ${state[i.id].when})`);
  if (dryRun) return;

  await fs.writeFile(vaultPath("03 Calendar", "Upcoming Tests.md"), renderUpcoming(items, today));
  for (const i of items) state[i.id] = { title: i.title, when: i.when, kind: i.kind, seen: state[i.id]?.seen ?? today };
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));

  const announce = [...fresh, ...moved].filter((i) => i.kind === "test" || i.kind === "quiz" || i.kind === "project");
  for (const i of announce) {
    await appendLog(`schoology: ${state[i.id] && moved.includes(i) ? "rescheduled" : "new"} ${i.kind} "${i.title}" in ${i.course} on ${i.when}`);
  }
  for (const i of announce) await notify("test_posted", `${i.course}: ${i.title} (${i.kind}) on ${i.when}`, "03 Calendar/Upcoming Tests.md");
  if (announce.length > 0) await discord(announce, today);
  console.log(`Wrote Upcoming Tests.md. Announced ${announce.length}.`);
}

function renderUpcoming(items: Item[], today: string): string {
  const daysUntil = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  const rows = (kinds: Kind[]) =>
    items
      .filter((i) => kinds.includes(i.kind))
      .map((i) => `| ${i.when} | ${daysUntil(i.when)} | ${i.course} | ${i.url ? `[${i.title}](${i.url})` : i.title} | ${i.kind} |`)
      .join("\n") || "| | | | _nothing posted_ | |";
  return [
    "---",
    "generated_by: agent",
    `updated: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    "---",
    "# Upcoming tests",
    "",
    "From Schoology. Regenerated on every sync; edit `_Course.md` or Schoology, not this file.",
    "",
    "## Tests, quizzes, projects",
    "",
    "| Date | Days | Course | What | Kind |",
    "|---|---|---|---|---|",
    rows(["test", "quiz", "project"]),
    "",
    "## Everything else due",
    "",
    "| Date | Days | Course | What | Kind |",
    "|---|---|---|---|---|",
    rows(["assignment", "event"]),
    "",
  ].join("\n");
}

async function discord(items: Item[], today: string) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  const lines = items.map((i) => {
    const days = Math.round((Date.parse(i.when) - Date.parse(today)) / 86_400_000);
    return `• **${i.course}** — ${i.title} (${i.kind}) on ${i.when}, in ${days} day${days === 1 ? "" : "s"}`;
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `📚 Schoology posted:\n${lines.join("\n")}` }),
  });
  if (!res.ok) console.error(`Discord webhook returned ${res.status}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
