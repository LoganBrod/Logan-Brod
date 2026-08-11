// Searches that keep running after you close the tab.
//
// This is the difference between a tool and a service, and it exists because of
// one fact about secondhand: inventory is ephemeral. The right jacket in your
// size at your price is listed on a Tuesday and gone by Wednesday. A search run
// the moment someone presses a button can only ever see what happens to be
// listed in that second — it is structurally blind to almost everything that
// would have suited them.
//
// So a watch is a saved set of queries plus the memory of what it has already
// reported. A sweep runs them, throws away everything seen before, judges what
// is left exactly as a normal run would, and emails whatever survives.

import { randomUUID } from "node:crypto";
import { getJson, redisConfigured, setJson } from "./redis";
import type { PriceRange } from "./sources/types";
import type { Owner } from "./library";

export interface Watch {
  id: string;
  /** What it's called in the list and in the email subject. */
  name: string;
  queries: string[];
  range: PriceRange;
  createdAt: string;
  /** Null until the first sweep. */
  lastSweptAt?: string;
  /** How many pieces it has ever surfaced — the honest measure of whether it earns its place. */
  found: number;
  paused?: boolean;
}

/**
 * How many listings a watch remembers having reported.
 *
 * Big enough that a piece isn't offered twice within any plausible window,
 * bounded because it's one value read and rewritten on every sweep. Keyed on
 * the dedupe key rather than the listing id, so the same jacket relisted under
 * a new id is still recognised as one already seen.
 */
const SEEN_LIMIT = 400;

/** Queries per watch. More than this and it isn't a watch, it's a second app. */
export const MAX_QUERIES_PER_WATCH = 6;

function key(owner: Owner): string {
  return owner.kind === "user" ? `user:${owner.id}:watches` : `taste:${owner.id}:watches`;
}

function seenKey(owner: Owner, watchId: string): string {
  const base = owner.kind === "user" ? `user:${owner.id}` : `taste:${owner.id}`;
  return `${base}:seen:${watchId}`;
}

export async function readWatches(owner: Owner | null): Promise<Watch[]> {
  if (!owner || !redisConfigured()) return [];
  try {
    const watches = await getJson<Watch[]>(key(owner));
    return Array.isArray(watches) ? watches : [];
  } catch {
    return [];
  }
}

async function writeWatches(owner: Owner, watches: Watch[]): Promise<void> {
  await setJson(key(owner), watches);
}

export async function addWatch(
  owner: Owner,
  input: { name: string; queries: string[]; range: PriceRange }
): Promise<Watch> {
  const watch: Watch = {
    id: randomUUID().replace(/-/g, "").slice(0, 16),
    name: input.name.trim().slice(0, 60) || "Untitled watch",
    queries: input.queries
      .map((query) => query.trim())
      .filter(Boolean)
      .slice(0, MAX_QUERIES_PER_WATCH),
    range: input.range,
    createdAt: new Date().toISOString(),
    found: 0,
  };

  await writeWatches(owner, [watch, ...(await readWatches(owner))]);
  await joinRoster(owner);
  return watch;
}

export async function updateWatch(
  owner: Owner,
  id: string,
  patch: Partial<Pick<Watch, "name" | "paused" | "found" | "lastSweptAt">>
): Promise<Watch | null> {
  const watches = await readWatches(owner);
  const found = watches.find((watch) => watch.id === id);
  if (!found) return null;

  const updated = { ...found, ...patch };
  await writeWatches(
    owner,
    watches.map((watch) => (watch.id === id ? updated : watch))
  );
  return updated;
}

export async function removeWatch(owner: Owner, id: string): Promise<boolean> {
  const watches = await readWatches(owner);
  if (!watches.some((watch) => watch.id === id)) return false;
  const remaining = watches.filter((watch) => watch.id !== id);
  await writeWatches(owner, remaining);
  // Off the roster when the last one goes, so the sweep isn't reading people
  // who have nothing to sweep.
  if (!remaining.length) await leaveRoster(owner);
  return true;
}

// -------------------------------------------------------------------- seen

export async function readSeen(owner: Owner, watchId: string): Promise<string[]> {
  if (!redisConfigured()) return [];
  try {
    const seen = await getJson<string[]>(seenKey(owner, watchId));
    return Array.isArray(seen) ? seen : [];
  } catch {
    return [];
  }
}

/**
 * Record what a sweep reported.
 *
 * Written *after* the email is sent, deliberately. If the send fails, the
 * pieces stay unseen and the next sweep offers them again — the failure mode is
 * being told twice, which is a nuisance, rather than never being told, which
 * is the entire product silently not working.
 */
export async function markSeen(owner: Owner, watchId: string, keys: string[]): Promise<void> {
  if (!keys.length || !redisConfigured()) return;
  const existing = await readSeen(owner, watchId);
  const merged = [...keys, ...existing].slice(0, SEEN_LIMIT);
  await setJson(seenKey(owner, watchId), merged);
}

/**
 * Turn a finished run into a watch.
 *
 * The queries a person's own photos produced are already the best description
 * of what they're looking for, so a watch is offered as a continuation of a
 * closet rather than as a form to fill in. Nobody wants to write six eBay
 * queries; they've just been written.
 */
export function watchFromQueries(queries: string[], range: PriceRange, name: string) {
  return {
    name,
    range,
    // The analyze pass orders queries by how central they are to the style, so
    // the first few are the ones worth watching forever.
    queries: queries.slice(0, MAX_QUERIES_PER_WATCH),
  };
}

// --------------------------------------------------------------- the roster

/**
 * Who has watches, so the sweep knows whose to run.
 *
 * Redis has no way to ask "which keys exist" that is safe to run on a schedule,
 * so the roster is kept explicitly. A plain array rather than a set because the
 * REST helper has no set commands and this is read once per sweep — it wants
 * replacing with a real index long before it holds thousands of people, and
 * MAX_WATCHERS is there so it fails visibly rather than truncating in silence.
 */
const ROSTER_KEY = "watch:roster";
const MAX_WATCHERS = 5000;

export async function listWatchers(): Promise<Owner[]> {
  if (!redisConfigured()) return [];
  try {
    const roster = await getJson<Owner[]>(ROSTER_KEY);
    return Array.isArray(roster) ? roster : [];
  } catch {
    return [];
  }
}

export async function joinRoster(owner: Owner): Promise<void> {
  const roster = await listWatchers();
  if (roster.some((entry) => entry.kind === owner.kind && entry.id === owner.id)) return;
  if (roster.length >= MAX_WATCHERS) {
    throw new Error("The watch roster is full. It needs a real index before more can be added.");
  }
  await setJson(ROSTER_KEY, [...roster, owner]);
}

export async function leaveRoster(owner: Owner): Promise<void> {
  const roster = await listWatchers();
  await setJson(
    ROSTER_KEY,
    roster.filter((entry) => !(entry.kind === owner.kind && entry.id === owner.id))
  );
}
