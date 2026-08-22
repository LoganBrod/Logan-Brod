// The seen-pieces memory against a stand-in Upstash: record -> read -> strike out.
//
//   npm test
//
// seen.test.mjs proves `siftSeen` filters correctly on its own. This proves the
// two ends are joined — that finishing a closet writes its ids down, and that a
// later search reads them back and removes them. That path runs through three
// files and a Redis round trip, and no pure test can see any of it.
//
// lib/redis.ts reads its connection details at module load, so the env has to
// be set before the dynamic import below.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeUpstash } from "./fake-upstash.mjs";

let fake;
let seen;

const BROWSER = "browser-under-test";

before(async () => {
  fake = await startFakeUpstash();
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  seen = await import("../lib/seen.ts");
});

after(async () => {
  await fake?.close();
});

test("a browser that has never run anything has seen nothing", async () => {
  assert.deepEqual(await seen.readSeen("nobody"), []);
});

test("a piece hung in one run is struck out of the next one's pool", async () => {
  // The whole complaint, end to end.
  await seen.recordSeen(BROWSER, ["L1", "L2", "L3", "L4"]);

  const nextSearch = [
    { id: "L2" },
    { id: "L4" },
    ...Array.from({ length: 40 }, (_, i) => ({ id: `N${i}` })),
  ];
  const sifted = seen.siftSeen(nextSearch, await seen.readSeen(BROWSER));

  assert.equal(sifted.removed, 2);
  assert.equal(sifted.pool.length, 40);
  for (const id of ["L2", "L4"]) {
    assert.ok(!sifted.pool.some((p) => p.id === id), `${id} came back around`);
  }
});

test("a second run adds to the record rather than replacing it", async () => {
  await seen.recordSeen(BROWSER, ["N0", "N1"]);
  const ids = await seen.readSeen(BROWSER);

  assert.equal(ids.length, 6);
  assert.ok(ids.includes("L1"), "the first run's pieces were forgotten");
  // Newest first, because the top-up when a pool runs thin reads from the tail
  // to bring back whatever has been off the rail longest.
  assert.equal(ids[0], "N0");
});

test("hanging the same piece twice doesn't record it twice", async () => {
  const before = (await seen.readSeen(BROWSER)).length;
  await seen.recordSeen(BROWSER, ["N0", "N0", "L1"]);
  assert.equal((await seen.readSeen(BROWSER)).length, before);
});

test("the record is bounded, and it's the oldest that falls off", async () => {
  const id = "heavy-user";
  // Two full sweeps past the cap, oldest written first.
  const first = Array.from({ length: seen.MAX_SEEN }, (_, i) => `old${i}`);
  await seen.recordSeen(id, first);
  await seen.recordSeen(id, ["newest"]);

  const ids = await seen.readSeen(id);
  assert.equal(ids.length, seen.MAX_SEEN, "the list grew past its cap");
  assert.equal(ids[0], "newest");
  assert.ok(!ids.includes(`old${seen.MAX_SEEN - 1}`), "the oldest id should have fallen off");
});

test("an unidentifiable browser writes nothing and reads nothing", async () => {
  // Rather than throwing. Not knowing what somebody has seen means a worse
  // closet; it must never mean a failed run.
  await seen.recordSeen(null, ["X"]);
  assert.deepEqual(await seen.readSeen(null), []);
});

// Last on purpose: it takes the store away, and nothing after it could read.
test("a store that has gone away doesn't take the closet with it", async () => {
  // The call site is a closet that has already been built and paid for. An
  // exception here would throw away a finished run over bookkeeping, so both
  // sides swallow and carry on — reads come back empty, writes do nothing.
  await fake.close();
  fake = null;

  await assert.doesNotReject(() => seen.recordSeen(BROWSER, ["whatever"]));
  assert.deepEqual(await seen.readSeen(BROWSER), [], "a failed read must look like no history");
});
