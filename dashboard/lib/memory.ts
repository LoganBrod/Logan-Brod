/**
 * Reads memory/ off disk for the dashboard.
 *
 * This runs on the server only (Next.js server components). It never reaches
 * the browser, which matters: the browser has no filesystem access, and these
 * notes should not be shipped wholesale to the client.
 *
 * NOTE: the checklist parser below mirrors the one in
 * mcp/context-server/src/memory.ts. Two copies of a parser is real duplication
 * and it will drift eventually. It is deliberate for now — sharing it means a
 * workspace package or a build step between two apps that otherwise have
 * nothing to do with each other. Extract it the first time a fix has to be
 * applied in both places.
 */

import fs from "node:fs/promises";
import path from "node:path";

const MEMORY_ROOT = path.resolve(process.cwd(), "..", "memory");

async function read(relative: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(MEMORY_ROOT, relative), "utf8");
  } catch {
    return null; // a missing note is an empty panel, not a crashed dashboard
  }
}

export interface OpenQuestion {
  question: string;
  context: string;
}

export function parseOpenQuestions(markdown: string): OpenQuestion[] {
  const lines = markdown.split(/\r?\n/);
  const out: OpenQuestion[] = [];
  const ITEM = /^\s*[-*+]\s*\[( |x|X)\]\s*(.+)$/;
  const FENCE = /^\s*(```|~~~)/;
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i] ?? "")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = ITEM.exec(lines[i] ?? "");
    if (!m || (m[1] ?? "").toLowerCase() === "x") continue;

    // A question can wrap onto following lines before any **Label:** appears.
    // Treating every indented line as context split questions mid-sentence on
    // screen — "How does the under-18 part of the target market hold a" with
    // "marketplace account?" rendered underneath as though it were commentary.
    const questionParts = [stripDate(m[2] ?? "")];
    const detail: string[] = [];
    let inDetail = false;

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? "";
      if (next.trim() === "" || ITEM.test(next) || !/^\s+\S/.test(next)) break;

      if (next.trim().startsWith("**")) inDetail = true;
      if (inDetail) detail.push(next.trim());
      else questionParts.push(next.trim());
    }

    out.push({
      question: stripMarkdown(questionParts.join(" ")),
      context: stripMarkdown(
        detail.join(" ").replace(/^\*\*Context:\*\*\s*/, ""),
      ),
    });
  }
  return out;
}

/** Entries are stored as "2026-08-04 — question"; the date is noise on a wall. */
function stripDate(text: string): string {
  return text.replace(/^\d{4}-\d{2}-\d{2}\s*[—-]\s*/, "").trim();
}

export interface Decision {
  date: string;
  decision: string;
}

export function parseDecisions(markdown: string): Decision[] {
  const out: Decision[] = [];
  const HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*[—-]\s*(.+)$/;
  let inFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = HEADING.exec(line);
    if (m) out.push({ date: m[1] ?? "", decision: (m[2] ?? "").trim() });
  }
  // Newest first: the file is chronological, the wall wants the latest.
  return out.reverse();
}

export interface Business {
  slug: string;
  name: string;
  whatItIs: string;
  stage: string;
  bottleneck: string;
}

/**
 * Pull a "**Label:** value" block out of a business file.
 *
 * Values wrap across lines, so this collects until a blank line or the next
 * bold label. Done by walking lines rather than with one regex: the regex
 * version used `$` under the `m` flag, where `$` means end of *line*, so every
 * value silently truncated to its first line. Reads better this way anyway.
 */
function field(markdown: string, label: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`**${label}:**`));
  if (start === -1) return "";

  const collected = [lines[start]!.slice(`**${label}:**`.length)];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.startsWith("**") || line.startsWith("#")) break;
    collected.push(line);
  }
  return stripMarkdown(collected.join(" "));
}

/** Bold/italic/backtick markers are noise on a wall display. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getBusinesses(): Promise<Business[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(path.join(MEMORY_ROOT, "businesses"));
  } catch {
    return [];
  }

  const files = entries
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .filter((f) => f.toLowerCase() !== "readme.md");

  const businesses: Business[] = [];
  for (const file of files) {
    const md = await read(path.join("businesses", file));
    if (!md) continue;
    const slug = file.replace(/\.md$/i, "");
    businesses.push({
      slug,
      name: (/^#\s+(.+)$/m.exec(md)?.[1] ?? slug).trim(),
      whatItIs: field(md, "What it is"),
      stage: field(md, "Stage"),
      bottleneck: field(md, "Biggest bottleneck right now"),
    });
  }
  return businesses;
}

export async function getOpenQuestions(): Promise<OpenQuestion[]> {
  const md = await read("open-questions.md");
  return md ? parseOpenQuestions(md) : [];
}

export async function getDecisions(): Promise<Decision[]> {
  const md = await read("decisions.md");
  return md ? parseDecisions(md) : [];
}

export interface WeeklyNote {
  heading: string;
  lines: string[];
}

/**
 * The most recent weekly entry — weekly.md is newest-at-top, so that is the
 * first "## " heading outside a code fence.
 *
 * The fence check matters: the file documents its own format with an example
 * "## Week of YYYY-MM-DD" block, and without skipping fences the dashboard
 * proudly displays the blank template as though it were this week's note.
 */
export async function getLatestWeekly(): Promise<WeeklyNote | null> {
  const md = await read("weekly.md");
  if (!md) return null;

  const lines = md.split(/\r?\n/);
  let inFence = false;
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^##\s+/.test(line)) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^##\s+/.test(line) || /^\s*(```|~~~)/.test(line)) break;
    const clean = stripMarkdown(line);
    if (clean) body.push(clean);
  }

  return {
    heading: stripMarkdown((lines[start] ?? "").replace(/^##\s*/, "")),
    lines: body,
  };
}
