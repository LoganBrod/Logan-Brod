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
import { MAX_PICKS_PER_SLOT, capBySlot, normaliseSlot } from "./categories";

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
 * batches rather than the size of each one is what lets a run cover the pool
 * without lowering the bar any single pick had to clear.
 *
 * The cost is real and roughly linear: six curation calls where there were
 * three. Curation is the most expensive step in a run.
 */
export const MAX_BATCHES = 6;

/**
 * Picks asked of each batch.
 *
 * Two of sixteen. This was four, which across six batches made a rail of
 * twenty-four — and twenty-four is where the recommendations stopped being
 * recommendations. A quota is not a request, it is an instruction: a model
 * asked for four out of sixteen will find four, and if only one of the sixteen
 * genuinely suits the person then three of every four pieces on the rail are
 * there because a number said so. Somebody uploading three coats they love and
 * getting back twenty-four things, none of them his, is exactly what that
 * arithmetic produces.
 *
 * One in eight is a bar. Paired with the score floor in `curate.ts` — which
 * lets a thin batch return nothing at all — the rail holds however many pieces
 * actually cleared it, up to twelve.
 */
export const PICKS_PER_BATCH = 2;

/**
 * The most pieces a finished closet holds.
 *
 * Twelve rather than twenty-four, and a ceiling rather than a target. Nothing
 * pads up to it: if four pieces cleared the bar, the closet has four.
 */
export const FINAL_PICKS = 12;

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

/**
 * The merge the curation prompt has been promising.
 *
 * Each batch is told it is looking at one slice of a larger search, that
 * several slices are being judged at once, and that "the results are merged
 * afterwards and the best overall are kept". None of that was true. The batches
 * were concatenated in whatever order they came back, and every pick any batch
 * made survived — so a batch that scraped together two 55s out of a weak slice
 * put them on the rail ahead of a 90 from a strong one, and with eight pieces
 * to a page the ordering decided what most people ever saw.
 *
 * This is the other half. It runs once, when the run finishes: sort by score,
 * keep the ceiling. Ties fall back to price, cheaper first, so the order is
 * stable across runs rather than depending on which batch happened to return
 * first.
 *
 * Not run while the closet is filling. Pieces arrive as their batch lands and
 * nothing is taken back down mid-run; the rail settles best-first once, at the
 * end, when there is finally something to rank against.
 */
export function rankAndCut<T extends { score: number; price: number; attrs?: { category?: string } }>(
  items: T[],
  limit: number = FINAL_PICKS
): T[] {
  const ranked = [...items].sort((a, b) => b.score - a.score || a.price - b.price);

  // Ranked first, then thinned by slot. Doing it in this order means the cap
  // removes the *weakest* fifth pair of boots rather than whichever happened to
  // come back first — and because `capBySlot` preserves order, what survives is
  // still strictly best-first.
  return capBySlot(
    ranked,
    (item) => normaliseSlot(item.attrs?.category),
    MAX_PICKS_PER_SLOT
  ).slice(0, limit);
}
