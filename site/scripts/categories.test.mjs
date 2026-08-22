// Slots, and the cap that stops one of them taking over a closet.
//
//   npm test
//
// The bug: "too shoe focused". Three separate causes, and only one of them was
// a prompt. The analyze prompt's own query examples were footwear — two of
// four, plus a third inside the schema's `describe` — so a model shown three
// shoe examples wrote shoe queries. Those are fixed in the text. But an
// instruction about proportion is the most-ignored kind of instruction there
// is, which is what this file exists to enforce instead.

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PICKS_PER_SLOT,
  MAX_QUERIES_PER_SLOT,
  capBySlot,
  normaliseSlot,
} from "../lib/categories.ts";
import { FINAL_PICKS, rankAndCut } from "../lib/batching.ts";

test("the many ways a model says footwear all land in one bucket", () => {
  // If these scattered across several slots, each would get its own allowance
  // and the cap would do nothing at all — which is the failure that matters.
  for (const raw of [
    "footwear",
    "Footwear",
    "  footwear  ",
    "shoes",
    "shoe",
    "boots",
    "Chelsea boots",
    "sneakers",
    "trainers",
    "loafers",
    "casual footwear",
    "shoes / boots",
  ]) {
    assert.equal(normaliseSlot(raw), "footwear", `${raw} did not read as footwear`);
  }
});

test("the other slots are recognised too", () => {
  const expected = {
    outerwear: ["outerwear", "jacket", "Waxed Coat", "parka", "overshirt"],
    tops: ["tops", "shirt", "knitwear", "sweater", "hoodie", "polo", "tee"],
    bottoms: ["bottoms", "trousers", "jeans", "denim", "chinos", "shorts"],
    accessories: ["accessories", "belt", "bag", "cap", "scarf", "watch", "gloves"],
  };
  for (const [slot, examples] of Object.entries(expected)) {
    for (const raw of examples) {
      assert.equal(normaliseSlot(raw), slot, `${raw} did not read as ${slot}`);
    }
  }
});

test("an unrecognised category is 'other' rather than a guess", () => {
  assert.equal(normaliseSlot("sporrans"), "other");
  assert.equal(normaliseSlot(""), "other");
  assert.equal(normaliseSlot("   "), "other");
  assert.equal(normaliseSlot(undefined), "other");
  assert.equal(normaliseSlot(null), "other");
});

const q = (category, id) => ({ category, id });
const slotOf = (item) => normaliseSlot(item.category);

test("a run of one slot is trimmed to the cap", () => {
  const queries = Array.from({ length: 8 }, (_, i) => q("footwear", i));
  assert.equal(capBySlot(queries, slotOf, MAX_QUERIES_PER_SLOT).length, MAX_QUERIES_PER_SLOT);
});

test("it keeps the first of a slot, not an arbitrary few", () => {
  const kept = capBySlot(
    [q("footwear", "a"), q("footwear", "b"), q("footwear", "c"), q("footwear", "d")],
    slotOf,
    2
  );
  assert.deepEqual(
    kept.map((k) => k.id),
    ["a", "b"]
  );
});

test("trimming one slot doesn't touch the others", () => {
  // The real shape of the complaint: six footwear searches out of ten, so the
  // pool everything downstream draws from was mostly shoes.
  const queries = [
    q("footwear", 1),
    q("footwear", 2),
    q("outerwear", 3),
    q("footwear", 4),
    q("tops", 5),
    q("footwear", 6),
    q("bottoms", 7),
    q("footwear", 8),
    q("tops", 9),
    q("footwear", 10),
  ];
  const kept = capBySlot(queries, slotOf, MAX_QUERIES_PER_SLOT);
  const slots = kept.map(slotOf);
  assert.equal(slots.filter((s) => s === "footwear").length, MAX_QUERIES_PER_SLOT);
  assert.equal(slots.filter((s) => s === "tops").length, 2);
  assert.equal(slots.filter((s) => s === "outerwear").length, 1);
  assert.equal(slots.filter((s) => s === "bottoms").length, 1);
});

test("it does not backfill from the slot it just trimmed", () => {
  // Backfilling would put the same six footwear searches back, further down the
  // list, which is precisely the outcome being fixed. Seven varied queries beat
  // ten skewed ones.
  const queries = [
    ...Array.from({ length: 6 }, (_, i) => q("footwear", `f${i}`)),
    ...Array.from({ length: 3 }, (_, i) => q("tops", `t${i}`)),
    q("trousers", "b0"),
  ];
  const kept = capBySlot(queries, slotOf, MAX_QUERIES_PER_SLOT);
  assert.equal(kept.length, 7, "backfilled past the cap");
  assert.equal(kept.filter((k) => slotOf(k) === "footwear").length, 3);
});

test("'other' is capped like everything else", () => {
  // Otherwise a mis-tagged category is the way around the cap.
  const queries = Array.from({ length: 9 }, (_, i) => q("sporrans", i));
  assert.equal(capBySlot(queries, slotOf, 3).length, 3);
});

test("a cap of zero keeps nothing, and an empty list stays empty", () => {
  assert.deepEqual(capBySlot([q("tops", 1)], slotOf, 0), []);
  assert.deepEqual(capBySlot([], slotOf, 3), []);
});

// --- and the same cap on the finished closet -----------------------------

const pick = (score, category, price = 100) => ({ score, price, attrs: { category } });

test("a closet can't be more than four pieces of one slot", () => {
  // Even when footwear swept the scoring, which is the case where the searches
  // were fine and one slot's listings simply photographed better.
  const items = Array.from({ length: 12 }, (_, i) => pick(95 - i, "boots"));
  const closet = rankAndCut(items);
  assert.equal(closet.length, MAX_PICKS_PER_SLOT);
});

test("the cap removes the weakest of a slot, not the last to arrive", () => {
  const items = [
    pick(99, "boots"),
    pick(98, "boots"),
    pick(97, "boots"),
    pick(96, "boots"),
    pick(60, "boots"),
    pick(70, "shirt"),
  ];
  const closet = rankAndCut(items);
  assert.deepEqual(
    closet.map((c) => c.score),
    [99, 98, 97, 96, 70],
    "the 60 boot should have gone, and the 70 shirt stayed"
  );
});

test("what survives the cap is still strictly best-first", () => {
  const items = [
    pick(50, "boots"),
    pick(95, "shirt"),
    pick(72, "trousers"),
    pick(88, "jacket"),
    pick(61, "boots"),
  ];
  const scores = rankAndCut(items).map((c) => c.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test("a varied closet is left alone", () => {
  const items = [
    pick(95, "jacket"),
    pick(90, "shirt"),
    pick(85, "trousers"),
    pick(80, "boots"),
    pick(75, "belt"),
  ];
  assert.equal(rankAndCut(items).length, 5);
});

test("an untagged closet still can't be all one thing", () => {
  // Older saved closets have no attrs at all. They land in 'other', which is
  // capped — the alternative is that the cap silently stops applying to them.
  const items = Array.from({ length: 10 }, (_, i) => ({ score: 90 - i, price: 100 }));
  assert.equal(rankAndCut(items).length, MAX_PICKS_PER_SLOT);
});

test("the two caps are consistent with the closet size", () => {
  // Four of twelve means a full closet always spans at least three slots. If
  // the cap ever exceeded the closet it would stop being a constraint.
  assert.ok(MAX_PICKS_PER_SLOT < FINAL_PICKS);
  assert.ok(FINAL_PICKS / MAX_PICKS_PER_SLOT >= 3);
});

test("the slot cap can be lifted, for a page where everything is one slot", () => {
  // Every accessory — belt, cap, bag, watch — normalises to `accessories`, so
  // the clozet's four-per-slot rule would cap the whole accessories page at
  // four and read as a search that found almost nothing.
  const items = [
    pick(95, "belt"),
    pick(90, "bag"),
    pick(85, "cap"),
    pick(80, "watch"),
    pick(75, "accessory"),
    pick(70, "scarf"),
  ];
  assert.equal(rankAndCut(items).length, MAX_PICKS_PER_SLOT, "the default should still cap");
  assert.equal(rankAndCut(items, FINAL_PICKS, FINAL_PICKS).length, 6);
});
