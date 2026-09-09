// The quiz's deck, and the cache that stops it costing fifteen searches.
//
//   npm test
//
// The pool is shared across everybody, so the thing worth proving is that a
// cached one is actually used: a visitor who arrives after the pool has been
// built must not touch a marketplace at all. Both cases run against the fake
// Upstash, with no source configured, so a build would return nothing and a
// cache hit returns the seeded pieces - which is exactly the difference the
// assertions look for.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeUpstash } from "./fake-upstash.mjs";

let fake;
let pool;

const seeded = [
  { id: "ebay:1", source: "ebay", title: "Carhartt Detroit jacket", price: 120, currency: "USD", url: "https://example.com/1", imageUrl: "https://example.com/1.jpg", matchedQuery: "carhartt detroit jacket brown duck" },
  { id: "ebay:2", source: "ebay", title: "Barbour Bedale", price: 180, currency: "USD", url: "https://example.com/2", imageUrl: "https://example.com/2.jpg", matchedQuery: "barbour waxed jacket olive" },
];

before(async () => {
  fake = await startFakeUpstash();
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  // No EBAY_* and no SERPAPI_KEY: every source reports itself unconfigured,
  // so any path that actually searches comes back empty.
  delete process.env.EBAY_CLIENT_ID;
  delete process.env.EBAY_CLIENT_SECRET;
  delete process.env.SERPAPI_KEY;
  pool = await import("../lib/calibrationPool.ts");
});

after(async () => {
  await fake.close();
});

test("a fresh pool is served from the cache, without searching", async () => {
  fake.store.set("calibrate:pool:v1", {
    value: JSON.stringify({ builtAt: new Date().toISOString(), listings: seeded }),
    expiresAt: null,
  });

  const listings = await pool.calibrationPool();
  assert.equal(listings.length, 2);
  assert.deepEqual(
    listings.map((l) => l.id),
    ["ebay:1", "ebay:2"],
    "the cached pieces came back, so nothing went to a marketplace"
  );
});

test("a stale pool still answers, rather than making somebody wait for a rebuild", async () => {
  const old = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  fake.store.set("calibrate:pool:v1", {
    value: JSON.stringify({ builtAt: old, listings: seeded }),
    expiresAt: null,
  });

  const listings = await pool.calibrationPool();
  assert.equal(listings.length, 2, "twelve hours old and still served");
});

test("a builtAt nobody can parse is treated as stale, not as a reason to fail", async () => {
  fake.store.set("calibrate:pool:v1", {
    value: JSON.stringify({ builtAt: "not a date", listings: seeded }),
    expiresAt: null,
  });

  const listings = await pool.calibrationPool();
  assert.equal(listings.length, 2);
});

test("no cache and no configured source is an empty deck, not an error", async () => {
  fake.store.delete("calibrate:pool:v1");
  const listings = await pool.calibrationPool();
  assert.deepEqual(listings, []);
});

test("an empty pool still deals a full deck from the app's own garments", async () => {
  const { FALLBACK_DECK } = await import("../lib/calibrationFallback.ts");
  const { dealCards, CARDS } = await import("../lib/calibration.ts");

  const dealt = dealCards(FALLBACK_DECK, CARDS);
  assert.equal(dealt.length, CARDS, "fifteen cards, so the quiz reads the same either way");
  assert.equal(new Set(dealt.map((c) => c.id)).size, CARDS, "no card is asked twice");
  assert.ok(
    dealt.every((c) => c.imageUrl?.startsWith("/garments-sm/") && c.title),
    "every card is a local photograph with a title"
  );
  assert.ok(new Set(dealt.map((c) => c.slot)).size >= 3, "and they are spread across slots");
});
