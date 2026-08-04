/**
 * Reading and searching memory/. All paths come from paths.ts.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { memoryRoot, assertRealPathInside } from "./paths.js";

export interface SearchMatch {
  /** Path relative to memory/, e.g. "businesses/levoz.md". */
  file: string;
  /** 1-based, so it matches what an editor shows. */
  line: number;
  text: string;
  context: string[];
}

/** Raised when memory/ itself is missing, which is a setup problem. */
export class MemoryMissingError extends Error {
  constructor(root: string) {
    super(
      `Memory folder not found at ${root}. Set MEMORY_DIR if it lives ` +
        `elsewhere, or create the folder.`,
    );
    this.name = "MemoryMissingError";
  }
}

/**
 * Every .md file under memory/, relative to the root.
 *
 * withFileTypes avoids a stat() per entry. Symlinked directories are skipped:
 * a link pointing back up the tree would otherwise make this walk forever, and
 * anything it could reach is outside memory/ by definition.
 */
export async function listMarkdownFiles(): Promise<string[]> {
  const root = memoryRoot();
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        if (dir === root) throw new MemoryMissingError(root);
        return; // a subdirectory vanished mid-walk; not fatal
      }
      throw err;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        found.push(path.relative(root, full));
      }
    }
  }

  await walk(root);
  return found.sort();
}

export interface OpenQuestion {
  line: number;
  question: string;
  detail: string[];
}

/**
 * Business slugs that actually have a file, for "did you mean" messages.
 * A README lives in that folder as documentation, so it is not a business.
 */
export async function listBusinesses(): Promise<string[]> {
  const dir = path.resolve(memoryRoot(), "businesses");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map((e) => e.name.replace(/\.md$/i, ""))
      .filter((n) => n.toLowerCase() !== "readme")
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Pull unresolved items out of open-questions.md.
 *
 * Tolerant by design. The file is hand-editable, so this accepts "-", "*" and
 * "+" bullets and any amount of leading whitespace, and treats anything it
 * cannot parse as prose to skip rather than an error. A notes file that has
 * drifted from the template should still yield its questions — refusing to
 * parse would make the tool useless exactly when the file is messiest.
 *
 * "[ ]" is unresolved; "[x]" is resolved and excluded.
 *
 * Fenced code blocks are skipped. The file documents its own format with an
 * example checklist item inside a ``` fence, and without this the parser
 * reports that template line as a real open question — which is worse than a
 * cosmetic bug, because the whole point of the file is telling Logan what is
 * genuinely unresolved.
 */
export function parseOpenQuestions(markdown: string): OpenQuestion[] {
  const lines = markdown.split(/\r?\n/);
  const questions: OpenQuestion[] = [];
  const ITEM = /^\s*[-*+]\s*\[( |x|X)\]\s*(.+)$/;
  const FENCE = /^\s*(```|~~~)/;

  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i] ?? "")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = ITEM.exec(lines[i] ?? "");
    if (!match) continue;
    if ((match[1] ?? "").toLowerCase() === "x") continue;

    // Indented, non-blank lines below an item belong to it.
    const detail: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? "";
      if (next.trim() === "") break;
      if (ITEM.test(next)) break;
      if (!/^\s+\S/.test(next)) break;
      detail.push(next.trim());
    }

    questions.push({
      line: i + 1,
      question: (match[2] ?? "").trim(),
      detail,
    });
  }

  return questions;
}

/** Read a file already proven to be inside memory/. */
export async function readMemoryFile(relative: string): Promise<string> {
  const full = path.resolve(memoryRoot(), relative);
  await assertRealPathInside(full);
  return fs.readFile(full, "utf8");
}

/**
 * Append text to a file in memory/. The only write path in this server.
 *
 * Uses the "a" flag, which opens the file in append mode: every write goes to
 * the current end of file, and the kernel will not let it land anywhere else.
 * There is deliberately no equivalent of writeFile here — not "we avoid
 * calling it", but no code path that can truncate a file at all. That is what
 * makes "append-only" a property of the program rather than a promise.
 *
 * Why it matters: an assistant that can rewrite its own memory can quietly
 * revise history, and Logan would have no way to notice. With appends only,
 * the worst a bug or a bad model turn can do is add noise to the bottom of a
 * file — which is visible, and revertible with git.
 *
 * If the file does not exist it is created with `header`, so a fresh clone or
 * a deleted file recovers instead of producing a headerless fragment.
 */
export async function appendToMemoryFile(
  relative: string,
  text: string,
  header: string,
): Promise<{ path: string; created: boolean }> {
  const full = path.resolve(memoryRoot(), relative);
  await assertRealPathInside(full);

  let created = false;
  try {
    await fs.access(full);
  } catch {
    await fs.mkdir(path.dirname(full), { recursive: true });
    // "wx" fails if another process created the file in the meantime, so we
    // never clobber a file that appeared between the access() and here.
    try {
      await fs.writeFile(full, header, { flag: "wx" });
      created = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }

  await fs.appendFile(full, text, "utf8");
  return { path: relative, created };
}

/**
 * Today as YYYY-MM-DD in the local timezone.
 *
 * Not toISOString().slice(0,10) — that is UTC, so anyone logging a decision
 * late in the evening west of Greenwich would have it dated tomorrow.
 */
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Case-insensitive substring search across every markdown file.
 *
 * Substring, not regex: the query arrives from an LLM, and an unanchored
 * user-supplied regex is a denial-of-service waiting to happen (catastrophic
 * backtracking on input like "(a+)+$"). Escaping the query and matching
 * literally removes the whole class of problem, and full-text search over a
 * handful of notes does not need more.
 */
export async function searchMemory(
  query: string,
  options: { maxResults?: number; contextLines?: number } = {},
): Promise<SearchMatch[]> {
  const maxResults = options.maxResults ?? 50;
  const contextLines = options.contextLines ?? 1;
  const needle = query.toLowerCase();

  const files = await listMarkdownFiles();
  const matches: SearchMatch[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = await readMemoryFile(file);
    } catch {
      continue; // unreadable file should not sink the whole search
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!line.toLowerCase().includes(needle)) continue;

      const from = Math.max(0, i - contextLines);
      const to = Math.min(lines.length, i + contextLines + 1);

      matches.push({
        file,
        line: i + 1,
        text: line.trim(),
        context: lines.slice(from, to),
      });

      if (matches.length >= maxResults) return matches;
    }
  }

  return matches;
}
