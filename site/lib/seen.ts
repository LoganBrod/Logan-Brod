// What this browser has already been shown, so it isn't shown again.
//
// The taste memory records what somebody *liked* — categories, makers,
// materials — and it does that well. What nothing recorded was which specific
// listings had already been on their rail, so every run drew from the same
// marketplace with the same searches and put the same jacket up a second and
// third time. From the outside that reads as an app with nothing new to say.
//
// Only pieces that actually reached a finished closet are recorded. Recording
// the whole candidate pool would blacklist hundreds of listings a person never
// laid eyes on, and after a couple of runs the searches would be returning
// results that had all been quietly struck out.

import { getJson, redisConfigured, setJson } from "./redis";

/**
 * How long a piece stays struck out.
 *
 * Sixty days. Secondhand stock turns over — a listing shown today is usually
 * gone within a few weeks, and the handful still up two months later are
 * genuinely worth another look rather than being repeats. Without an expiry
 * this set only grows, and eventually the best listings on the market are all
 * on it.
 */
export const SEEN_TTL_SECONDS = 60 * 24 * 60 * 60;

/**
 * The most ids kept, newest first.
 *
 * This is one value read and rewritten on every save, so it is bounded for the
 * same reason the taste facets are: an unbounded list becomes a slow write and
 * then a failed one.
 */
export const MAX_SEEN = 600;

/**
 * How small a pool may get before seen pieces are allowed back in.
 *
 * Two batches' worth. The case this exists for is somebody running the same
 * photographs twice: identical uploads produce near-identical searches, which
 * return near-identical listings, all of which are now struck out — so a
 * strict filter would hand them an empty closet and no explanation. Topping
 * back up means a repeat run shows familiar pieces rather than nothing, which
 * is the honest outcome: there was nothing new to find.
 */
export const MIN_POOL = 32;

function key(id: string): string {
  return `seen:${id}`;
}

/** Newest first, so trimming to `MAX_SEEN` drops the oldest. */
export async function readSeen(id: string | null): Promise<string[]> {
  if (!id || !redisConfigured()) return [];
  try {
    return (await getJson<string[]>(key(id))) ?? [];
  } catch {
    // Never fail a run over this. Not knowing what someone has seen means
    // repeats, which is a worse closet — not a broken one.
    return [];
  }
}

/** Add the pieces from a finished closet. Newest ids go to the front. */
export async function recordSeen(id: string | null, listingIds: string[]): Promise<void> {
  if (!id || !redisConfigured() || !listingIds.length) return;
  try {
    const existing = await readSeen(id);
    const merged: string[] = [];
    const added = new Set<string>();

    for (const listingId of [...listingIds, ...existing]) {
      if (!listingId || added.has(listingId)) continue;
      added.add(listingId);
      merged.push(listingId);
      if (merged.length >= MAX_SEEN) break;
    }

    await setJson(key(id), merged, SEEN_TTL_SECONDS);
  } catch {
    // Best effort, like the rest of this file.
  }
}

export interface Sifted<T> {
  /** What to judge: everything unseen, plus a top-up if that was too thin. */
  pool: T[];
  /** How many were struck out and stayed out. */
  removed: number;
  /** How many had to be let back in to reach `MIN_POOL`. */
  reused: number;
}

/**
 * Drop what this browser has already been shown.
 *
 * Order is preserved. The pool arrives interleaved across the searches that
 * produced it, and that interleaving is what makes contiguous slices a spread
 * of garment types rather than sixteen of one — re-sorting here would undo it.
 */
export function siftSeen<T extends { id: string }>(
  listings: T[],
  seen: Iterable<string>,
  minimum: number = MIN_POOL
): Sifted<T> {
  const struck = seen instanceof Set ? seen : new Set(seen);
  if (!struck.size) return { pool: listings, removed: 0, reused: 0 };

  const fresh: T[] = [];
  const familiar: T[] = [];
  for (const listing of listings) {
    (struck.has(listing.id) ? familiar : fresh).push(listing);
  }

  if (fresh.length >= minimum || !familiar.length) {
    return { pool: fresh, removed: familiar.length, reused: 0 };
  }

  // Short. Let the oldest-seen back in — `seen` is newest-first, so reading it
  // from the end brings back whatever has been off the rail longest.
  const order = new Map([...struck].map((id, index) => [id, index]));
  const oldestFirst = [...familiar].sort(
    (a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0)
  );
  const topUp = oldestFirst.slice(0, minimum - fresh.length);
  const backIn = new Set(topUp.map((item) => item.id));

  return {
    // Rebuilt from the original order rather than concatenated, so the
    // query interleaving survives the top-up.
    pool: listings.filter((item) => !struck.has(item.id) || backIn.has(item.id)),
    removed: familiar.length - topUp.length,
    reused: topUp.length,
  };
}
