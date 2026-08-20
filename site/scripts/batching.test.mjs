// How the candidate pool is split for curation, and how arriving picks are
// folded into what's already hanging.
//
//   npm test
//
// The invariant that matters most here is that nothing already on the rail is
// ever removed. Batches finish out of order, and a piece disappearing because a
// later batch scored better would be far worse than an arbitrary order.

import assert from "node:assert/strict";
import test from "node:test";
import {
  FINAL_PICKS,
  MAX_BATCHES,
  MAX_VIEWED,
  PICKS_PER_BATCH,
  appendPicks,
  planBatches,
  rankAndCut,
} from "../lib/batching.ts";

const pool = (count, over = {}) =>
  Array.from({ length: count }, (_, i) => ({
    id: `ebay:${i}`,
    source: "ebay",
    title: `Piece ${i}`,
    price: 100,
    currency: "USD",
    url: `https://example.com/${i}`,
    imageUrl: `https://example.com/${i}.jpg`,
    ...over,
  }));

test("a full pool splits into the batches that run at once", () => {
  // Sized from the constants rather than a literal: this fixture was 60, which
  // was a full pool at three batches and silently a short one at six.
  const batches = planBatches(pool(MAX_BATCHES * MAX_VIEWED));
  assert.equal(batches.length, MAX_BATCHES);
  for (const batch of batches) assert.equal(batch.length, MAX_VIEWED);
});

test("the pool is capped — extra candidates cost photos nobody looks at", () => {
  const batches = planBatches(pool(200));
  assert.equal(batches.flat().length, MAX_BATCHES * MAX_VIEWED);
});

test("a thin pool runs fewer batches rather than empty ones", () => {
  assert.equal(planBatches(pool(10)).length, 1);
  assert.equal(planBatches(pool(20)).length, 2);
});

test("a listing with no photo can't be judged, so it isn't sent", () => {
  const mixed = [...pool(4), ...pool(4).map((item) => ({ ...item, imageUrl: undefined }))];
  assert.equal(planBatches(mixed).flat().length, 4);
  assert.deepEqual(planBatches(pool(3).map((i) => ({ ...i, imageUrl: undefined }))), []);
});

test("a runt batch is folded back rather than run on its own", () => {
  // 17 would leave a batch of one, which can only return its least-bad item.
  const batches = planBatches(pool(17));
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 17);
});

test("nothing already hanging is ever removed", () => {
  const first = [{ id: "a" }, { id: "b" }];
  const next = appendPicks(first, [{ id: "c" }]);
  assert.deepEqual(
    next.map((i) => i.id),
    ["a", "b", "c"]
  );
});

test("the same piece picked by two batches only hangs once", () => {
  const current = [{ id: "a" }, { id: "b" }];
  const next = appendPicks(current, [{ id: "b" }, { id: "c" }, { id: "c" }]);
  assert.deepEqual(
    next.map((i) => i.id),
    ["a", "b", "c"]
  );
});

test("a batch that adds nothing doesn't churn the rail", () => {
  const current = [{ id: "a" }];
  // Same array back, so React sees no change and nothing re-animates.
  assert.equal(appendPicks(current, [{ id: "a" }]), current);
  assert.equal(appendPicks(current, []), current);
});

// --- the merge -------------------------------------------------------------
//
// The curation prompt tells every batch that the slices are merged afterwards
// and the best overall are kept. For a long time that was simply false: the
// batches were concatenated in arrival order and every pick survived.

const pick = (id, score, price = 100) => ({ id, score, price });

test("the best score leads, whichever batch it came back in", () => {
  const merged = rankAndCut([pick("a", 62), pick("b", 91), pick("c", 74)]);
  assert.deepEqual(
    merged.map((i) => i.id),
    ["b", "c", "a"]
  );
});

test("a weak batch's picks lose to a strong batch's, which is the whole point", () => {
  // Two 55s that arrived first used to sit ahead of a 90 that arrived last —
  // and with eight to a page, ahead is all that most people ever see.
  const merged = rankAndCut([pick("weak1", 61), pick("weak2", 62), pick("strong", 90)], 2);
  assert.deepEqual(
    merged.map((i) => i.id),
    ["strong", "weak2"]
  );
});

test("the ceiling is a ceiling, not a target", () => {
  const three = rankAndCut([pick("a", 80), pick("b", 70), pick("c", 90)]);
  assert.equal(three.length, 3, "three good pieces must stay three, not pad to twelve");
  assert.equal(rankAndCut([]).length, 0);

  const many = Array.from({ length: 40 }, (_, i) => pick(`x${i}`, 60 + i));
  assert.equal(rankAndCut(many).length, FINAL_PICKS);
});

test("ties break on price, so the same closet ranks the same way twice", () => {
  const merged = rankAndCut([pick("dear", 80, 400), pick("cheap", 80, 90)]);
  assert.deepEqual(
    merged.map((i) => i.id),
    ["cheap", "dear"]
  );
});

test("the input is left alone — the rail is still rendering from it", () => {
  const items = [pick("a", 60), pick("b", 99)];
  const merged = rankAndCut(items);
  assert.deepEqual(
    items.map((i) => i.id),
    ["a", "b"]
  );
  assert.notEqual(merged, items);
});

test("the per-batch quota cannot on its own overflow the closet", () => {
  // If these ever drift apart the cut starts silently discarding work that was
  // paid for, which is a different and worse bug than showing too much.
  assert.ok(
    PICKS_PER_BATCH * MAX_BATCHES <= FINAL_PICKS,
    `${PICKS_PER_BATCH} x ${MAX_BATCHES} batches exceeds the ${FINAL_PICKS} the closet keeps`
  );
});
