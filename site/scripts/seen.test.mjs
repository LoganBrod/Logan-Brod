// Not showing somebody the same jacket three runs running.
//
//   npm test
//
// The taste memory recorded what a person liked — categories, makers, materials
// — and nothing at all recorded which specific listings had been on their rail.
// So every run drew from the same marketplace with near-enough the same
// searches, and put the same pieces up again. From the outside that reads as an
// app with nothing new to say.

import assert from "node:assert/strict";
import test from "node:test";
import { MIN_POOL, siftSeen } from "../lib/seen.ts";

const pool = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `L${i + offset}`, title: `Piece ${i + offset}` }));

test("a piece already shown doesn't come back", () => {
  const listings = pool(40);
  const { pool: kept, removed } = siftSeen(listings, ["L0", "L5", "L9"]);
  assert.equal(removed, 3);
  assert.equal(kept.length, 37);
  for (const id of ["L0", "L5", "L9"]) {
    assert.ok(!kept.some((k) => k.id === id), `${id} came back`);
  }
});

test("a first-ever run is untouched", () => {
  const listings = pool(40);
  const sifted = siftSeen(listings, []);
  assert.equal(sifted.pool, listings, "a new browser shouldn't even copy the array");
  assert.equal(sifted.removed, 0);
});

test("the pool keeps the order the searches produced", () => {
  // Contiguous slices of this become the curation batches, and they're only a
  // spread of garment types because the pool arrives interleaved by query.
  // Re-ordering here would quietly undo that.
  // Comfortably above MIN_POOL, so nothing is recycled and the order under
  // test is the filter's own.
  const listings = pool(40);
  const { pool: kept } = siftSeen(listings, ["L3", "L11"]);
  assert.deepEqual(
    kept.map((k) => k.id),
    listings.filter((l) => l.id !== "L3" && l.id !== "L11").map((l) => l.id)
  );
});

test("running the same photos twice gives you a closet, not an empty room", () => {
  // Identical uploads produce near-identical searches, which return
  // near-identical listings — all of them now struck out. A strict filter hands
  // this person an empty wardrobe and no explanation.
  const listings = pool(40);
  const everything = listings.map((l) => l.id);
  const sifted = siftSeen(listings, everything);
  assert.equal(sifted.pool.length, MIN_POOL, "nothing was let back in");
  assert.equal(sifted.reused, MIN_POOL);
  assert.equal(sifted.removed, 40 - MIN_POOL);
});

test("what comes back is what has been off the rail longest", () => {
  // `seen` is newest-first, so the top-up should start from its tail.
  const listings = pool(6);
  const seen = ["L5", "L4", "L3", "L2", "L1", "L0"]; // L5 shown most recently
  const { pool: kept } = siftSeen(listings, seen, 2);
  assert.deepEqual(
    kept.map((k) => k.id).sort(),
    ["L0", "L1"],
    "the two least recently seen should be the ones reused"
  );
});

test("a thin-but-not-empty pool is topped up to the minimum, not past it", () => {
  const listings = pool(40);
  const seen = listings.slice(0, 30).map((l) => l.id); // 10 fresh, 30 struck
  const sifted = siftSeen(listings, seen);
  assert.equal(sifted.pool.length, MIN_POOL);
  assert.equal(sifted.reused, MIN_POOL - 10);
  // And the fresh ones are all still there — the top-up adds, never replaces.
  for (const listing of listings.slice(30)) {
    assert.ok(sifted.pool.some((k) => k.id === listing.id), `${listing.id} was dropped`);
  }
});

test("a pool already over the minimum is filtered strictly", () => {
  const listings = pool(80);
  const seen = listings.slice(0, 20).map((l) => l.id); // 60 fresh, well over MIN_POOL
  const sifted = siftSeen(listings, seen);
  assert.equal(sifted.reused, 0, "nothing should be recycled while there's plenty fresh");
  assert.equal(sifted.pool.length, 60);
});

test("a small pool with nothing seen in it is left alone", () => {
  const listings = pool(4);
  const sifted = siftSeen(listings, ["nothing", "in", "common"]);
  assert.equal(sifted.pool.length, 4);
  assert.equal(sifted.reused, 0);
});

test("a Set and an array of ids behave the same", () => {
  const listings = pool(10);
  const asArray = siftSeen(listings, ["L1", "L2"]);
  const asSet = siftSeen(listings, new Set(["L1", "L2"]));
  assert.deepEqual(asArray.pool.map((k) => k.id), asSet.pool.map((k) => k.id));
});
