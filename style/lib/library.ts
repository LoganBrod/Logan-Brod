// Every closet you've built, and which of them you decided to keep.
//
// The closets themselves already persisted — each run has always written one
// under its own code with a ninety-day life. What was missing was any way back
// to them: the cookie held only the most recent code, so every earlier closet
// was still sitting in storage with nothing pointing at it. This is that
// pointer.
//
// An owner is an account when you're signed in and the anonymous browser id
// when you aren't, and the shape is identical either way — which is what lets
// signing in adopt everything you built beforehand instead of stranding it.

import { CLOSET_TTL_SECONDS, isValidCode } from "./closet";
import { expire, getJson, persist, redisConfigured, setJson } from "./redis";

/** One line in the list. Deliberately not the closet itself — this is read on every page load. */
export interface LibraryEntry {
  code: string;
  /** What you called it when you kept it. Absent until then. */
  name?: string;
  createdAt: string;
  keptAt?: string;
  /** Enough to render a row without fetching every closet. */
  itemCount: number;
  range: { min: number; max: number };
}

/**
 * How many entries are remembered.
 *
 * Kept closets are never dropped; this only bounds the run history, which is
 * one Redis value read and rewritten on every save. Fifty is far past the point
 * anyone scrolls, and unkept entries expire from under it anyway.
 */
const MAX_ENTRIES = 50;

export type Owner = { kind: "user"; id: string } | { kind: "browser"; id: string };

function key(owner: Owner): string {
  return owner.kind === "user" ? `user:${owner.id}:closets` : `taste:${owner.id}:closets`;
}

/** Most recent first. Never throws — a missing library is an empty one. */
export async function readLibrary(owner: Owner | null): Promise<LibraryEntry[]> {
  if (!owner || !redisConfigured()) return [];
  try {
    const entries = await getJson<LibraryEntry[]>(key(owner));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

async function writeLibrary(owner: Owner, entries: LibraryEntry[]): Promise<void> {
  // Kept closets are permanent, so they're never what gets trimmed. Everything
  // else is history, newest first.
  const kept = entries.filter((entry) => entry.keptAt);
  const rest = entries.filter((entry) => !entry.keptAt).slice(0, MAX_ENTRIES);

  const order = new Map(entries.map((entry, index) => [entry.code, index]));
  const merged = [...kept, ...rest].sort(
    (a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0)
  );

  // The index outlives any single closet in it, so it carries no expiry of its
  // own; entries for closets that have expired are dropped on read instead.
  await setJson(key(owner), merged);
}

/** Record a newly-created closet at the top of its owner's list. */
export async function addToLibrary(owner: Owner | null, entry: LibraryEntry): Promise<void> {
  if (!owner || !redisConfigured()) return;
  try {
    const existing = await readLibrary(owner);
    const without = existing.filter((item) => item.code !== entry.code);
    await writeLibrary(owner, [entry, ...without]);
  } catch {
    // A closet that saved but didn't get indexed is still reachable by code.
    // Failing the save over a bookkeeping error would be the worse trade.
  }
}

export async function isOwned(owner: Owner | null, code: string): Promise<boolean> {
  if (!owner) return false;
  const entries = await readLibrary(owner);
  return entries.some((entry) => entry.code === code);
}

/**
 * Keep a closet, under a name.
 *
 * Keeping is what removes the expiry — an unkept closet is a run you happened
 * to make, and ninety days later it's gone. The name is asked for at this
 * moment rather than generated, because the point of keeping something is that
 * you know why you kept it.
 */
export async function keepCloset(
  owner: Owner,
  code: string,
  name: string
): Promise<LibraryEntry | null> {
  if (!isValidCode(code)) return null;

  const entries = await readLibrary(owner);
  const found = entries.find((entry) => entry.code === code);
  if (!found) return null;

  const updated: LibraryEntry = {
    ...found,
    name: name.trim().slice(0, 60) || undefined,
    keptAt: found.keptAt ?? new Date().toISOString(),
  };

  await persist(`closet:${code}`);
  await writeLibrary(
    owner,
    entries.map((entry) => (entry.code === code ? updated : entry))
  );
  return updated;
}

/** Let a kept closet go back to being ordinary history, expiry and all. */
export async function releaseCloset(owner: Owner, code: string): Promise<LibraryEntry | null> {
  const entries = await readLibrary(owner);
  const found = entries.find((entry) => entry.code === code);
  if (!found) return null;

  const updated: LibraryEntry = { ...found, keptAt: undefined };
  await expire(`closet:${code}`, CLOSET_TTL_SECONDS).catch(() => {});
  await writeLibrary(
    owner,
    entries.map((entry) => (entry.code === code ? updated : entry))
  );
  return updated;
}

/**
 * Drop a closet from the list.
 *
 * The closet itself is left alone. Anyone holding the code still has it, which
 * is the deal the code has always made — removing it here means "stop showing
 * me this", not "destroy it for everyone I shared it with".
 */
export async function forgetCloset(owner: Owner, code: string): Promise<boolean> {
  const entries = await readLibrary(owner);
  if (!entries.some((entry) => entry.code === code)) return false;
  await writeLibrary(
    owner,
    entries.filter((entry) => entry.code !== code)
  );
  return true;
}

/**
 * Fold one library into another, newest first, without duplicating a closet.
 *
 * Used when an anonymous browser signs in: everything it built beforehand joins
 * the account rather than being stranded behind a cookie.
 */
export function mergeLibraries(into: LibraryEntry[], from: LibraryEntry[]): LibraryEntry[] {
  const seen = new Set(into.map((entry) => entry.code));
  const incoming = from.filter((entry) => !seen.has(entry.code));
  return [...into, ...incoming].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function adoptLibrary(user: Owner, browser: Owner): Promise<void> {
  const [mine, theirs] = await Promise.all([readLibrary(user), readLibrary(browser)]);
  if (!theirs.length) return;
  await writeLibrary(user, mergeLibraries(mine, theirs));
}
