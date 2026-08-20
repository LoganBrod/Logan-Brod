// What survives between the model's answer and the rail.
//
// The bug behind all of this: someone uploaded three pieces he liked and got
// back twenty-four recommendations, none of them his style. Twenty-four was not
// how many good pieces the search found — it was four picks asked of each of six
// batches, and a model asked for four out of sixteen will always find four.
//
// So the number is now a ceiling and the score is now a bar, and both are
// enforced here rather than requested in a prompt.

import assert from "node:assert/strict";
import test from "node:test";
import { SCORE_FLOOR, selectPicks } from "../lib/curate.ts";

const listing = (id) => ({
  id,
  source: "ebay",
  title: `Piece ${id}`,
  price: 100,
  currency: "USD",
  url: `https://example.com/${id}`,
  imageUrl: `https://example.com/${id}.jpg`,
});

const viewed = ["a", "b", "c", "d"].map(listing);

const pick = (id, score) => ({
  id,
  score,
  whyItFits: "the olive suits you",
  category: "outerwear",
  brand: "unknown",
  material: "waxed cotton",
  colour: "olive",
});

test("a pick below the floor never reaches the rail", () => {
  const { items, belowFloor } = selectPicks(
    [pick("a", SCORE_FLOOR - 1), pick("b", SCORE_FLOOR)],
    viewed,
    4
  );
  assert.deepEqual(
    items.map((i) => i.id),
    ["b"],
    "the floor is exclusive of itself — SCORE_FLOOR exactly is good enough"
  );
  assert.equal(belowFloor, 1);
});

test("a batch with nothing good in it returns nothing, which is allowed", () => {
  // This is the whole point. Before, the quota meant this batch contributed
  // its two least-bad items to somebody's closet regardless.
  const { items, belowFloor } = selectPicks(
    [pick("a", 55), pick("b", 40), pick("c", 12)],
    viewed,
    2
  );
  assert.equal(items.length, 0);
  assert.equal(belowFloor, 3);
});

test("the quota is a ceiling the batch cannot talk its way past", () => {
  const { items } = selectPicks([pick("a", 90), pick("b", 88), pick("c", 86)], viewed, 2);
  assert.equal(items.length, 2);
  // And it keeps the best two, not the first two it happened to be handed.
  assert.deepEqual(
    items.map((i) => i.id),
    ["a", "b"]
  );
});

test("what it keeps is best-first, whatever order it was given in", () => {
  const { items } = selectPicks([pick("a", 61), pick("b", 95), pick("c", 78)], viewed, 4);
  assert.deepEqual(
    items.map((i) => i.score),
    [95, 78, 61]
  );
});

test("an invented id is dropped — there is no listing behind it", () => {
  const { items, belowFloor } = selectPicks([pick("nope", 99), pick("a", 80)], viewed, 4);
  assert.deepEqual(
    items.map((i) => i.id),
    ["a"]
  );
  // Hallucinated, not merely weak: it must not be counted against the floor.
  assert.equal(belowFloor, 0);
});

test("the same piece picked twice hangs once", () => {
  const { items } = selectPicks([pick("a", 90), pick("a", 70)], viewed, 4);
  assert.equal(items.length, 1);
  assert.equal(items[0].score, 90);
});

test("a pick carries the listing's own url and price, not the model's", () => {
  const { items } = selectPicks([pick("a", 80)], viewed, 4);
  assert.equal(items[0].url, "https://example.com/a");
  assert.equal(items[0].price, 100);
  assert.equal(items[0].attrs.material, "waxed cotton");
});

test("the floor is a bar, not a wall", () => {
  // Set too high this stops being quality control and starts returning empty
  // closets for perfectly good searches.
  assert.ok(SCORE_FLOOR >= 50 && SCORE_FLOOR <= 75, `${SCORE_FLOOR} is not a usable floor`);
});
