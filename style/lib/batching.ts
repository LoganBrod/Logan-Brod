// How the candidate pool is split for curation.
//
// Curation used to be one call over 48 product photos. Every one of those
// photos is fetched by the API before the model can begin, so that single call
// was the longest thing in the app by a wide margin. Splitting the pool lets
// the batches run at once: the wait becomes the slowest batch rather than the
// sum of all of them, and each batch's pieces can hang as soon as they arrive
// instead of everything waiting on the last photo.
//
// The pool arrives round-robin across the queries that produced it (see
// `interleaveByQuery`), so contiguous slices are already a spread of garment
// types rather than sixteen variations on one query. That's why this splits by
// slicing and doesn't re-deal.

import type { ProductListing } from "./sources/types";

/**
 * How many candidates one curation call looks at.
 *
 * This lives here rather than in `curate.ts` because the client imports it to
 * plan the batches, and `curate.ts` pulls in the Anthropic SDK — which must
 * never reach the browser bundle.
 *
 * It used to be 48 in a single call. Every photo is fetched by the API before
 * the model can start, so a batch is sized small enough to come back quickly
 * and large enough that it still has something to choose between.
 */
export const MAX_VIEWED = 16;

/**
 * How many batches run at once.
 *
 * Three is a compromise: more batches would finish sooner still, but each one
 * sees a smaller slice, and a batch that only has a handful of candidates to
 * choose between can't be selective — it starts returning the best of a bad
 * set rather than nothing.
 */
export const MAX_BATCHES = 3;

/**
 * Picks asked of each batch.
 *
 * Three of sixteen is about the same selectivity as the old six-to-ten of
 * forty-eight, so the bar hasn't moved — the judging is just spread out. The
 * ceiling this implies (nine pieces) is deliberate: everything a batch returns
 * is hung, so nothing a person has already seen is ever taken back off the rail
 * when a later batch lands.
 */
export const PICKS_PER_BATCH = 3;

/** Split the pool into the slices each curation call will see. */
export function planBatches(
  candidates: ProductListing[],
  { batchSize = MAX_VIEWED, maxBatches = MAX_BATCHES } = {}
): ProductListing[][] {
  const usable = candidates.filter((item) => item.imageUrl);
  if (!usable.length) return [];

  const batches: ProductListing[][] = [];
  for (let i = 0; i < usable.length && batches.length < maxBatches; i += batchSize) {
    batches.push(usable.slice(i, i + batchSize));
  }

  // A final batch of one or two can't be selective about anything, so it goes
  // back onto the batch before it rather than running a whole call to return
  // its least-bad item.
  if (batches.length > 1) {
    const last = batches[batches.length - 1];
    if (last.length <= 2) {
      batches.pop();
      batches[batches.length - 1].push(...last);
    }
  }

  return batches;
}

/**
 * Fold a newly-arrived batch into what's already hanging.
 *
 * Appends rather than re-sorting: batches finish in whatever order they finish,
 * and re-ordering the rail underneath someone every time one lands is worse
 * than an arbitrary order. Within a batch the picks are already best-first.
 */
export function appendPicks<T extends { id: string }>(current: T[], arriving: T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  const added = arriving.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return added.length ? [...current, ...added] : current;
}
