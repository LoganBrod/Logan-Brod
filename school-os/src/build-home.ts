// Rewrites 04 System/Home.md: what is due, what was filed lately, what needs you,
// what study material exists. Run last, after the other jobs.
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { DIRS } from "./config.js";
import { vaultPath, exists, readCourses, listCourseNotes } from "./vault.js";

type Item = { title: string; when: string; kind: string; course: string };

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);

  // Upcoming, from the Schoology state file
  const statePath = vaultPath(DIRS.system, "schoology-state.json");
  const state: Record<string, Item> = (await exists(statePath)) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};
  const upcoming = Object.values(state).filter((i) => i.when >= today).sort((a, b) => a.when.localeCompare(b.when));
  const tests = upcoming.filter((i) => ["test", "quiz", "project"].includes(i.kind)).slice(0, 5);
  const due = upcoming.filter((i) => i.kind === "assignment").slice(0, 8);

  // Recently filed notes (by file modification time), per course
  const courses = await readCourses();
  const recent: { course: string; name: string; mtime: number }[] = [];
  for (const c of courses) {
    for (const p of await listCourseNotes(c.name)) {
      const st = await fs.stat(p);
      if (Date.now() - st.mtimeMs < 3 * 86_400_000) recent.push({ course: c.name, name: path.basename(p, ".md"), mtime: st.mtimeMs });
    }
  }
  recent.sort((a, b) => b.mtime - a.mtime);

  // Needs review
  const nrPath = vaultPath(DIRS.system, "Needs Review.md");
  const needsReview = (await exists(nrPath))
    ? (await fs.readFile(nrPath, "utf8")).split("\n").filter((l) => l.startsWith("- [["))
    : [];

  // Study material on hand
  const decks = await listDir(vaultPath("02 Study", "Flashcards"));
  const testsOnHand = (await listDir(vaultPath("02 Study", "Practice Tests"))).filter((f) => !f.includes("Graded"));
  const reviews = await listDir(vaultPath("02 Study", "Unit Reviews"));

  const lines = [
    "# Home", "",
    `_Updated ${new Date().toISOString().slice(0, 16).replace("T", " ")} by the brain. Edit \`_Course.md\` files, not this._`, "",
    "## Coming up", "",
    tests.length
      ? tests.map((t) => `- **${days(t.when)} day${days(t.when) === 1 ? "" : "s"}** · ${t.course}: ${t.title} _(${t.kind})_`).join("\n")
      : "- No tests, quizzes or projects posted.",
    "", "## Due soon", "",
    due.length ? due.map((t) => `- ${t.when} · ${t.course}: ${t.title}`).join("\n") : "- Nothing.",
    "", "## Filed in the last 3 days", "",
    recent.length ? recent.slice(0, 15).map((r) => `- ${r.course}: [[${r.name}]]`).join("\n") : "- Nothing new.",
    "", "## Needs you", "",
    needsReview.length ? needsReview.join("\n") : "- Nothing. Inbox is clean.",
    "", "## Study material", "",
    `- Flashcard decks: ${decks.length ? decks.map((d) => `[[${d}]]`).join(", ") : "none yet"}`,
    `- Practice tests: ${testsOnHand.length ? testsOnHand.map((d) => `[[${d}]]`).join(", ") : "none yet"}`,
    `- Unit reviews: ${reviews.length ? reviews.map((d) => `[[${d}]]`).join(", ") : "none yet"}`,
    "", "## Courses", "",
    courses.map((c) => `- [[${c.name}/_Course|${c.name}]] · ${c.units.length} unit${c.units.length === 1 ? "" : "s"}`).join("\n"),
    "", "## Inbox", "",
    "```dataview", "TABLE date, status", 'FROM "00 Inbox"', "SORT date DESC", "```", "",
  ];
  await fs.writeFile(vaultPath(DIRS.system, "Home.md"), matter.stringify(lines.join("\n"), { generated_by: "agent" }));
  console.log(`Home.md: ${tests.length} upcoming, ${due.length} due, ${recent.length} recent, ${needsReview.length} to review.`);
}

async function listDir(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  return (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).sort();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
