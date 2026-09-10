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
import { MAX_PICKS_PER_LOOK, capByLook, capBySlot, colourFamily, normaliseSlot, pickCapFor, type Slot } from "./categories";

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
export function rankAndCut<
  T extends { score: number; price: number; title?: string; imageUrl?: string; attrs?: { category?: string; colour?: string } },
>(
  items: T[],
  limit: number = FINAL_PICKS,
  /**
   * How many of one slot may survive.
   *
   * Defaults to the clozet's rule, which is tighter for footwear than for
   * anything else — see `pickCapFor`. The accessories page passes its own, because
   * every accessory — belt, cap, bag, watch — normalises to the single
   * `accessories` slot, so the default would quietly cap that whole page at
   * four items and look like a search that found almost nothing. Spread across
   * accessory kinds is handled where it can be: by the planner asking for two
   * or three searches of each kind.
   */
  perSlot: number | ((slot: Slot) => number) = pickCapFor,
  /**
   * How many may share a slot *and* a colour.
   *
   * The accessories page passes a high number: everything there is one slot,
   * and belts are mostly brown and black, so the closet's rule would trim a
   * page of them to four.
   */
  perLook: number = MAX_PICKS_PER_LOOK
): T[] {
  const ranked = dropDuplicates(
    [...items].sort((a, b) => b.score - a.score || a.price - b.price)
  );

  // Ranked first, then thinned by slot. Doing it in this order means the cap
  // removes the *weakest* fifth pair of boots rather than whichever happened to
  // come back first — and because `capBySlot` preserves order, what survives is
  // still strictly best-first.
  const spread = capBySlot(ranked, (item) => normaliseSlot(item.attrs?.category), perSlot);

  /*
   * Then by look.
   *
   * A slot cap alone lets four tan jackets through, because one of them gets
   * called a shirt; this is keyed on what a person sees instead.
   *
   * It does not relax when it leaves the rail thin, and that was tried and
   * thrown away. Relaxing fills the rail with the repetition it just removed,
   * and worse, it hides the thinness from the one thing that can actually fix
   * it: the run asks for a second search when fewer than six pieces survive,
   * and a cap that pads back up to eight means that search never happens. A
   * short rail is a signal. Padding it is deleting the signal.
   *
   * "Fewer is correct when the batch came back thin - never pad" is the rule
   * the curation prompt already states. This is the same rule, applied to how
   * things look rather than to how they scored.
   */
  const varied = capByLook(
    spread,
    (item) => `${normaliseSlot(item.attrs?.category)}|${colourFamily(item.attrs?.colour)}`,
    perLook
  );

  return varied.slice(0, limit);
}

/**
 * The same thing, listed twice.
 *
 * The pool is deduplicated on title *and* rounded price, which catches one
 * listing found by two searches and misses the case people actually notice:
 * two sellers with the same jacket at ninety and ninety-five pounds. Those are
 * two different listings by every measure the code had, and one rail with both
 * on it looks broken in a way no amount of good judging can excuse.
 *
 * So the finished closet gets a stricter rule than the pool does. Nothing is
 * lost by it - the second copy is the same garment at a worse price or a worse
 * score, and the pool keeps both in case the better one is filtered out
 * upstream.
 *
 * Two keys, because sellers are inconsistent in different ways. An identical
 * photograph is the same product or the same seller relisting; nobody
 * photographs two garments into one URL. And a title stripped of the noise
 * that varies between listings of one product - the gender word, the word
 * "size", the size itself, the condition shorthand - catches the rest.
 */
const TITLE_NOISE =
  /\b(mens?|womens?|unisex|size|sz|nwt|nwot|euc|vgc|bnwt|new|used|rare|htf|free\s+shipping|fast\s+ship)\b/g;
const SIZE_TOKEN = /\b(xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|\d{2}(r|s|l)?|\d{2}x\d{2})\b/g;

export function sameThingKey(item: { title?: string }): string {
  return (item.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(TITLE_NOISE, " ")
    .replace(SIZE_TOKEN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Keep the first of anything that is the same photograph or the same garment. */
export function dropDuplicates<T extends { title?: string; imageUrl?: string }>(items: T[]): T[] {
  const photos = new Set<string>();
  const things = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    const photo = item.imageUrl ?? "";
    if (photo && photos.has(photo)) continue;
    const thing = sameThingKey(item);
    // A title that normalises to nothing is not evidence of anything.
    if (thing && things.has(thing)) continue;
    if (photo) photos.add(photo);
    if (thing) things.add(thing);
    kept.push(item);
  }
  return kept;
}
