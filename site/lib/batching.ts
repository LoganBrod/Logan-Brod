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
 * Six batches of sixteen is ninety-six candidates, against a pool capped at a
 * hundred and twenty — so this spends most of what the search already fetched
 * and paid for, rather than judging a third of it and discarding the rest.
 *
 * Each batch is still sixteen candidates, which is the number that matters for
 * selectivity: a batch that only has a handful to choose between starts
 * returning the best of a bad set rather than nothing. Widening the count of
 * batches rather than the size of each one is what lets the rail hold
 * twenty-four pieces without lowering the bar any single pick had to clear.
 *
 * The cost is real and roughly linear: six curation calls where there were
 * three. Curation is the most expensive step in a run.
 */
export const MAX_BATCHES = 6;

/**
 * Picks asked of each batch.
 *
 * Four of sixteen, across six batches, is a ceiling of twenty-four pieces — a
 * rail worth browsing rather than a single screenful. The ceiling is a real
 * ceiling: everything a batch returns is hung, so nothing a person has already
 * seen is ever taken back off the rail when a later batch lands.
 *
 * Four rather than eight because the alternative way to reach twenty-four is
 * three batches picking eight of sixteen, and a model asked for half of what it
 * is shown will find a reason to like half of what it is shown. One in four is
 * close enough to the old one in five that the bar has barely moved.
 */
export const PICKS_PER_BATCH = 4;

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
