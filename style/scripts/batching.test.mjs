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
import { MAX_BATCHES, MAX_VIEWED, appendPicks, planBatches } from "../lib/batching.ts";

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
  const batches = planBatches(pool(60));
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
