// Builds the Chinese lexicon: every word, character and grammar structure in the student's own
// Chinese material, from every year. The checker in the dashboard compares writing against it,
// and the fixer is only allowed to use what is in it. No model, no cost.
//
//   npm run chinese                  rebuild 04 System/chinese-lexicon.json
//   npm run chinese -- "我很喜欢…"     check a sentence in the terminal
//   tsx src/chinese.ts --if-chinese  what sync runs: silent when there is no Chinese course
//
// Reads every course folder whose name says Chinese (or CHINESE_COURSES in .env), including
// unit folders like "Chinese I" holding earlier years. Leaves out anything the assistant wrote
// (generated_by: agent), syllabi and policy sheets, and units listed under "Skip units" in
// 04 System/Chinese list.md.
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { DIRS } from "./config.js";
import { vaultPath, exists, appendLog } from "./vault.js";
import { emptyLexicon, addToLexicon, isChineseCourse, parseList, check, STRUCTURES, LIST_TEMPLATE, type Lexicon } from "../dashboard/lib/chinese.js";

const LEX = () => vaultPath(DIRS.system, "chinese-lexicon.json");
const LIST = () => vaultPath(DIRS.system, "Chinese list.md");
const args = process.argv.slice(2);
const quiet = args.includes("--if-chinese");
const sentence = args.filter((a) => !a.startsWith("--")).join(" ");

async function main() {
  if (!(await exists(LIST()))) await fs.writeFile(LIST(), LIST_TEMPLATE);
  const list = parseList(await fs.readFile(LIST(), "utf8"));

  if (sentence) {
    if (!(await exists(LEX()))) { console.log("No lexicon yet. Run: npm run chinese"); return; }
    const lex = JSON.parse(await fs.readFile(LEX(), "utf8")) as Lexicon;
    const r = check(sentence, lex, list);
    console.log(r.tokens.map((t) => t.status === "unknown" ? `[${t.text}?]` : t.status === "new" ? `[${t.text}~]` : t.text).join(""));
    for (const f of r.flagged) console.log(`  ${f.status === "unknown" ? "not in your material" : "new word, known characters"}: ${f.word}${f.unknownChars ? ` (unknown: ${f.unknownChars})` : ""}`);
    for (const s of r.structures) console.log(`  ${s.learned ? "learned" : "NOT learned"}: ${s.name}  "${s.match}"`);
    return;
  }

  const coursesDir = vaultPath(DIRS.courses);
  const chinese = (await exists(coursesDir) ? await fs.readdir(coursesDir, { withFileTypes: true }) : [])
    .filter((e) => e.isDirectory() && isChineseCourse(e.name, process.env.CHINESE_COURSES ?? ""))
    .map((e) => e.name);
  if (!chinese.length) {
    if (!quiet) console.log("No Chinese course folder found in 01 Courses. Name it with \"Chinese\", or set CHINESE_COURSES in .env.");
    return;
  }

  const lex = emptyLexicon();
  let files = 0, skipped = 0;
  for (const course of chinese) {
    for await (const p of walk(vaultPath(DIRS.courses, course))) {
      const rel = path.relative(vaultPath(DIRS.courses, course), p).split(path.sep);
      if (rel.some((part) => list.skipUnits.has(part))) { skipped++; continue; }
      const { data, content } = matter(await fs.readFile(p, "utf8"));
      if (data.generated_by === "agent" || data.type === "course info") { skipped++; continue; }
      if (!/[㐀-鿿]/.test(content)) continue;
      addToLexicon(lex, content, `${course} / ${path.basename(p, ".md")}`);
      files++;
    }
  }
  lex.generated = new Date().toISOString();
  await fs.writeFile(LEX(), JSON.stringify(lex));

  const words = Object.keys(lex.words).length;
  const learned = STRUCTURES.filter((s) => s.id in lex.structures && !list.blockStructures.has(s.id));
  const msg = `Chinese lexicon: ${files} file${files === 1 ? "" : "s"} from ${chinese.join(", ")}; ${words} words, ${[...lex.chars].length} characters, ${learned.length} structures.`;
  await appendLog(msg);
  if (quiet) return;
  console.log(msg + (skipped ? ` (${skipped} left out: generated, syllabi, or skipped units)` : ""));
  console.log(`Structures found: ${learned.map((s) => s.name).join(", ") || "none"}`);
  console.log(`Adjust what counts as learned in 04 System/Chinese list.md.`);
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === DIRS.sources) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.name.endsWith(".md") && e.name !== "_Course.md" && e.name !== "_Unit.md") yield full;
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
