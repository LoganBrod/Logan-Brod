// Which slot of an outfit a thing fills, and how many of one slot is too many.
//
// Both the searches and the picks are tagged with a free-text category by a
// model, so the same idea arrives as "footwear", "shoes", "boots", "Footwear "
// and "sneaker" depending on the run. Nothing downstream can count categories
// until they are the same string, and counting them is the point: the app has a
// standing habit of returning a closet that is mostly shoes.
//
// Why it happens is worth writing down, because the fix is not only here. The
// analyze prompt's own examples were footwear — two of four, plus a third in
// the schema's `describe` — and a model shown three shoe examples writes shoe
// queries. Those are fixed. But prompt instructions about proportion are the
// single most-ignored kind of instruction there is, so the proportion is also
// enforced in code, which is what this file is for.

export type Slot =
  | "outerwear"
  | "tops"
  | "bottoms"
  | "suiting"
  | "footwear"
  | "accessories"
  | "other";

/**
 * Words that give a slot away, longest-match first.
 *
 * Deliberately a substring match rather than an exact one: the models tag
 * things "footwear", "shoes / boots", and "casual footwear" interchangeably,
 * and an exact table would silently drop the ones it didn't predict into
 * "other" — where they'd escape the cap entirely, which is the failure that
 * matters.
 */
const HINTS: [string, Slot][] = [
  // Before "outerwear" and "tops": a suit is neither, and it is a whole outfit
  // rather than one line of one, so it gets its own allowance.
  ["suiting", "suiting"],
  ["suit", "suiting"],
  ["blazer", "suiting"],
  ["tailoring", "suiting"],
  ["outerwear", "outerwear"],
  ["jacket", "outerwear"],
  ["coat", "outerwear"],
  ["parka", "outerwear"],
  ["overshirt", "outerwear"],
  ["footwear", "footwear"],
  ["shoe", "footwear"],
  ["boot", "footwear"],
  ["sneaker", "footwear"],
  ["trainer", "footwear"],
  ["loafer", "footwear"],
  ["bottom", "bottoms"],
  ["trouser", "bottoms"],
  ["pant", "bottoms"],
  ["jean", "bottoms"],
  ["denim", "bottoms"],
  ["short", "bottoms"],
  ["chino", "bottoms"],
  ["accessor", "accessories"],
  ["belt", "accessories"],
  ["bag", "accessories"],
  ["cap", "accessories"],
  ["hat", "accessories"],
  ["scarf", "accessories"],
  ["watch", "accessories"],
  ["glove", "accessories"],
  ["top", "tops"],
  ["shirt", "tops"],
  ["tee", "tops"],
  ["t-shirt", "tops"],
  ["knit", "tops"],
  ["sweater", "tops"],
  ["jumper", "tops"],
  ["sweatshirt", "tops"],
  ["hoodie", "tops"],
  ["polo", "tops"],
];

/** The slot a free-text category belongs to. Unrecognised is `other`, not a guess. */
export function normaliseSlot(raw: string | undefined | null): Slot {
  if (!raw) return "other";
  const text = raw.toLowerCase().trim();
  if (!text) return "other";
  for (const [hint, slot] of HINTS) {
    if (text.includes(hint)) return slot;
  }
  return "other";
}

/**
 * Keep at most `cap` of any one slot, in the order given.
 *
 * Order is preserved rather than re-sorted, so callers keep whatever ranking
 * they arrived with — this only removes.
 *
 * It does **not** backfill from the slots it trimmed, and that is the whole
 * design. Backfilling would mean a model that returned six footwear searches
 * out of ten still got six footwear searches, just later in the list, which is
 * exactly the outcome being fixed. Returning seven varied queries instead of
 * ten skewed ones is the better trade: the pool is slightly smaller and it
 * actually covers a wardrobe.
 *
 * `other` is capped like anything else. Letting the unrecognised bucket run
 * free would make a mis-tagged category the way around the cap.
 */
export function capBySlot<T>(
  items: T[],
  slotOf: (item: T) => Slot,
  cap: number | ((slot: Slot) => number)
): T[] {
  const capFor = typeof cap === "function" ? cap : () => cap;
  const used = new Map<Slot, number>();
  const kept: T[] = [];

  for (const item of items) {
    const slot = slotOf(item);
    const allowed = capFor(slot);
    if (allowed <= 0) continue;
    const count = used.get(slot) ?? 0;
    if (count >= allowed) continue;
    used.set(slot, count + 1);
    kept.push(item);
  }

  return kept;
}

/**
 * Footwear gets a tighter allowance than everything else.
 *
 * A first pass gave every slot the same cap, and the closets that came back
 * were still shoe-heavy — because "the same as everything else" is already too
 * many. A wardrobe is not five equal parts. You wear one pair of shoes at a
 * time and you own a handful; you own many more shirts than boots, and you
 * think about trousers more often than either. An even cap encodes a wardrobe
 * nobody actually has.
 *
 * Two searches and two picks, against three and four for everything else. That
 * is still footwear being a sixth of a full closet, which is generous.
 */
export const FOOTWEAR_QUERY_CAP = 2;
export const FOOTWEAR_PICK_CAP = 2;

/** The per-slot allowance for the ten searches a run fans out to. */
export function queryCapFor(slot: Slot): number {
  return slot === "footwear" ? FOOTWEAR_QUERY_CAP : MAX_QUERIES_PER_SLOT;
}

/** The per-slot allowance for the finished closet. */
export function pickCapFor(slot: Slot): number {
  return slot === "footwear" ? FOOTWEAR_PICK_CAP : MAX_PICKS_PER_SLOT;
}

/**
 * How many of the ten searches may fill the same slot.
 *
 * Three. A wardrobe is mostly torso and legs, and footwear is one line of an
 * outfit — at three, footwear can still be well covered without being able to
 * take over the pool that everything downstream is drawn from.
 */
export const MAX_QUERIES_PER_SLOT = 3;

/**
 * How many pieces in a finished closet may fill the same slot.
 *
 * Four of twelve, so a full closet always spans at least three slots. This is
 * the backstop rather than the fix — by the time picks are being capped, the
 * money is already spent. It catches the case where the searches were varied
 * but one slot's listings simply photographed better.
 */
export const MAX_PICKS_PER_SLOT = 4;

/**
 * Colour families, because a closet of four tan jackets passes every other rule.
 *
 * The slot cap stops a run coming back as six pairs of boots. It does nothing
 * about six pieces that are the same piece: a chore jacket, a field jacket, a
 * work jacket and a barn coat, all in tan, are four different words for one
 * photograph, and the judge picks all four because all four are genuinely the
 * best match for the profile. Six batches judged in parallel, each asked for
 * its best two, will independently arrive at the same answer.
 *
 * So sameness gets its own cap, and it is keyed on what a person actually
 * sees: the slot and the colour. Not the model's `category`, which is where
 * the four jackets escape - one of them gets called a shirt and the cap never
 * fires.
 *
 * The families collapse the words people and sellers use for one colour.
 * "Tan", "khaki", "camel" and "sand" are the same jacket in a photograph, and
 * treating them as three distinct colours is exactly how the closet in the
 * screenshot got made.
 */
const COLOUR_FAMILIES: [string, string[]][] = [
  ["black", ["black", "jet", "onyx"]],
  ["white", ["white", "ivory", "off-white", "optic"]],
  ["grey", ["grey", "gray", "charcoal", "slate", "silver", "heather", "graphite", "pewter"]],
  ["navy", ["navy", "indigo", "denim", "midnight"]],
  ["blue", ["blue", "cobalt", "sky", "teal", "petrol", "azure"]],
  ["green", ["green", "olive", "army", "sage", "moss", "forest", "loden", "fatigue"]],
  ["tan", ["tan", "khaki", "beige", "sand", "camel", "stone", "oatmeal", "cream", "ecru", "taupe", "biscuit", "putty", "bone", "natural"]],
  ["brown", ["brown", "chocolate", "coffee", "walnut", "chestnut", "tobacco", "cognac", "espresso"]],
  ["rust", ["rust", "terracotta", "orange", "ochre", "amber", "copper", "brick"]],
  ["red", ["red", "burgundy", "maroon", "oxblood", "wine", "claret", "crimson"]],
  ["purple", ["purple", "plum", "aubergine", "lilac", "violet"]],
  ["pink", ["pink", "rose", "blush", "salmon"]],
  ["yellow", ["yellow", "mustard", "gold", "lemon"]],
];

/**
 * The family a colour belongs to, or "unknown".
 *
 * "unknown" is deliberately not capped alongside the rest: a run where the
 * model failed to name any colour would otherwise be trimmed to two pieces.
 */
export function colourFamily(raw: string | undefined | null): string {
  const text = (raw ?? "").toLowerCase().trim();
  if (!text) return "unknown";
  for (const [family, words] of COLOUR_FAMILIES) {
    if (words.some((word) => text.includes(word))) return family;
  }
  return "unknown";
}

/**
 * How many pieces of one slot may also share a colour.
 *
 * Two. Three tan jackets is a colour somebody likes; four is the search
 * having found one thing and the judge having agreed with itself six times.
 */
export const MAX_PICKS_PER_LOOK = 2;

/** Keep at most `cap` items sharing a slot and a colour family, in the order given. */
export function capByLook<T>(
  items: T[],
  lookOf: (item: T) => string,
  cap: number = MAX_PICKS_PER_LOOK
): T[] {
  const counts = new Map<string, number>();
  const kept: T[] = [];
  for (const item of items) {
    const look = lookOf(item);
    // Unnamed colours are not a look, and capping them would trim a run where
    // the model simply did not say.
    if (look.endsWith("|unknown")) {
      kept.push(item);
      continue;
    }
    const seen = counts.get(look) ?? 0;
    if (seen >= cap) continue;
    counts.set(look, seen + 1);
    kept.push(item);
  }
  return kept;
}
