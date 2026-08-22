// A short calibration, before the app has ever seen you choose anything.
//
// The taste memory is the best signal here, and it only exists after somebody
// has built a closet and reacted to it — so the very first run, the one that
// decides whether anybody comes back, is the one run with no taste data at all.
// This fills that gap in about a minute: a spread of real listings, swiped yes
// or no, feeding the same store the votes on a finished closet feed.
//
// Deliberately not a model call. These are fixed probes, so the shopping search
// is the only cost, and that is free. Choosing which pieces to show would be a
// nice use of a model and a bad use of a minute — a first-time visitor should
// not be waiting on inference before they have seen anything work.

/**
 * The probes.
 *
 * Chosen to *separate* people rather than to please them. A set everybody likes
 * teaches nothing: the point is that a man who says yes to the double-breasted
 * blazer and no to the cargo trousers has told us something the next man's
 * answers contradict. So they span registers — workwear, tailoring, street,
 * prep, outdoors, minimal — and within each, the version of the garment that
 * somebody could plausibly hate.
 *
 * Spread across slots too, using the same vocabulary as `lib/categories.ts`, so
 * a session can't accidentally be twelve jackets.
 */
export const CALIBRATION_PROBES = [
  { query: "carhartt detroit jacket brown duck", register: "workwear", slot: "outerwear" },
  { query: "barbour waxed jacket olive", register: "country", slot: "outerwear" },
  { query: "harrington jacket navy", register: "prep", slot: "outerwear" },
  { query: "leather bomber jacket black", register: "street", slot: "outerwear" },

  { query: "oxford cloth button down shirt blue", register: "prep", slot: "tops" },
  { query: "heavyweight flannel overshirt plaid", register: "workwear", slot: "tops" },
  { query: "merino crew neck sweater grey", register: "minimal", slot: "tops" },
  { query: "graphic print sweatshirt oversized", register: "street", slot: "tops" },

  { query: "selvedge denim jeans straight leg", register: "workwear", slot: "bottoms" },
  { query: "pleated wool trouser grey", register: "tailoring", slot: "bottoms" },
  { query: "cargo trousers olive", register: "street", slot: "bottoms" },
  { query: "chino trousers stone slim", register: "prep", slot: "bottoms" },

  { query: "leather chelsea boot brown", register: "minimal", slot: "footwear" },
  { query: "moc toe work boot leather", register: "workwear", slot: "footwear" },
  { query: "retro running sneakers suede", register: "street", slot: "footwear" },
] as const;

export type Probe = (typeof CALIBRATION_PROBES)[number];

/**
 * How many pieces somebody is asked about.
 *
 * Fifteen is roughly a minute at four seconds a card, which is about as much as
 * anyone will give an app they have not seen work yet. Fewer than ten and the
 * per-attribute counters never reach the threshold where they mean anything.
 */
export const CARDS = 15;

/** One listing per probe, so the spread survives however the searches go. */
export const PER_PROBE = 1;

/**
 * Interleave by slot, so the deck alternates rather than running four jackets
 * together.
 *
 * A run of one kind makes the whole exercise feel like it is asking the same
 * question repeatedly, and people start swiping without looking — which is
 * worse than no data, because it is confident noise.
 */
export function dealCards<T extends { slot?: string }>(items: T[], limit: number = CARDS): T[] {
  const bySlot = new Map<string, T[]>();
  for (const item of items) {
    const slot = item.slot ?? "other";
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot)!.push(item);
  }

  const queues = [...bySlot.values()];
  const dealt: T[] = [];
  let index = 0;
  while (dealt.length < limit && queues.some((q) => q.length)) {
    const queue = queues[index % queues.length];
    const next = queue.shift();
    if (next) dealt.push(next);
    index += 1;
  }
  return dealt;
}
