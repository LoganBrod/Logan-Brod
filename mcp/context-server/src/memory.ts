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

/** Read a file already proven to be inside memory/. */
export async function readMemoryFile(relative: string): Promise<string> {
  const full = path.resolve(memoryRoot(), relative);
  await assertRealPathInside(full);
  return fs.readFile(full, "utf8");
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
