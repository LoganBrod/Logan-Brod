/**
 * Path safety. This file is the entire security boundary of the server.
 *
 * Every filesystem path the server touches is produced here. Tool handlers
 * never build paths themselves — they pass a caller-supplied string in and get
 * back either a path proven to sit inside memory/, or an exception.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Thrown when a caller-supplied path would land outside memory/. */
export class PathEscapeError extends Error {
  constructor(attempted: string) {
    super(
      `Refused: "${attempted}" resolves outside the memory folder. ` +
        `This server can only read and write inside memory/.`,
    );
    this.name = "PathEscapeError";
  }
}

/**
 * Where memory/ lives.
 *
 * Defaults to the repo's memory/ folder, resolved relative to this file so the
 * server works no matter which directory the MCP client launches it from —
 * that matters because stdio servers inherit the client's working directory,
 * which is not something we control.
 *
 * MEMORY_DIR overrides it, which is what the tests use to point at a scratch
 * folder instead of real notes.
 */
export function memoryRoot(): string {
  const override = process.env.MEMORY_DIR;
  if (override && override.trim() !== "") return path.resolve(override);

  // build/paths.js -> context-server -> mcp -> repo root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "memory");
}

/**
 * Resolve a path inside memory/, or throw.
 *
 * The check is `path.relative`, not `resolved.startsWith(root)`. The prefix
 * version is a classic bug: with root "/home/me/memory", the string
 * "/home/me/memory-public/x" passes startsWith while sitting outside the
 * folder entirely. path.relative returns something beginning with ".." for
 * anything genuinely outside, on every platform.
 *
 * Note this alone does not stop a *symlink* inside memory/ pointing elsewhere,
 * because the check is textual. assertRealPathInside() below closes that.
 */
export function resolveInMemory(...segments: string[]): string {
  const root = memoryRoot();
  const resolved = path.resolve(root, ...segments);
  const rel = path.relative(root, resolved);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathEscapeError(segments.join("/"));
  }
  return resolved;
}

/**
 * Second gate, for paths that exist: resolve symlinks and re-check.
 *
 * resolveInMemory() reasons about the path as text. A symlink at
 * memory/notes.md pointing to /etc/passwd is textually inside memory/ but
 * reads something else. realpath() follows the link and tells us where the
 * bytes actually come from.
 *
 * Missing files are allowed through — "does not exist" is the caller's problem
 * to report, not an escape attempt.
 */
export async function assertRealPathInside(target: string): Promise<void> {
  const root = memoryRoot();
  let realTarget: string;
  let realRoot: string;

  try {
    realTarget = await fs.realpath(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  try {
    realRoot = await fs.realpath(root);
  } catch {
    realRoot = root;
  }

  const rel = path.relative(realRoot, realTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathEscapeError(target);
  }
}

/**
 * Business names become filenames, so they get their own allow-list on top of
 * the path guard.
 *
 * Allowing only [a-z0-9-] means a hostile name cannot express traversal in the
 * first place — no dots, no slashes, no backslashes, no NUL. Defence in depth:
 * if resolveInMemory ever regressed, this would still hold. Rejecting bad
 * input beats sanitising it, because sanitising silently turns "../../etc" into
 * something that looks legitimate.
 */
export function businessSlug(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(
      `Invalid business name "${name}". Use letters, numbers, spaces or ` +
        `hyphens only — names map directly to filenames in memory/businesses/.`,
    );
  }
  return slug;
}
