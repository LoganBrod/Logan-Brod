// Offline checks for the source-layer logic that has no network dependency:
// dedupe, per-query interleaving, and the graceful no-credentials path.
//
//   node --experimental-strip-types scripts/sources.test.mjs
//
// Live search quality still has to be eyeballed against real listings once
// EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are set — see style/README.md.

import assert from "node:assert/strict";
import test from "node:test";
import { dedupeKey, interleaveByQuery, queriesFor, shop } from "../lib/sources/index.ts";

const listing = (over = {}) => ({
  id: "ebay:1",
  source: "ebay",
  title: "Barbour Beaufort Waxed Cotton Jacket",
  price: 189.99,
  currency: "USD",
  url: "https://example.com/1",
  ...over,
});

test("dedupeKey ignores punctuation, casing, and sub-dollar price drift", () => {
  const a = listing({ title: "Barbour Beaufort — Waxed Cotton Jacket", price: 189.99 });
  const b = listing({ title: "barbour beaufort waxed cotton jacket!", price: 190.4 });
  assert.equal(dedupeKey(a), dedupeKey(b));
});

test("dedupeKey keeps genuinely different items apart", () => {
  const a = listing({ title: "Barbour Beaufort Waxed Jacket", price: 189 });
  const b = listing({ title: "Barbour Bedale Waxed Jacket", price: 189 });
  assert.notEqual(dedupeKey(a), dedupeKey(b));
});

test("interleaveByQuery stops one broad query from eating the whole budget", () => {
  const flood = Array.from({ length: 30 }, (_, i) =>
    listing({ id: `ebay:a${i}`, matchedQuery: "jacket" })
  );
  const narrow = Array.from({ length: 4 }, (_, i) =>
    listing({ id: `ebay:b${i}`, matchedQuery: "brown suede chelsea boot" })
  );

  const out = interleaveByQuery([...flood, ...narrow], 10);

  assert.equal(out.length, 10);
  const fromNarrow = out.filter((i) => i.matchedQuery === "brown suede chelsea boot");
  assert.equal(fromNarrow.length, 4, "every narrow-query result should survive the cap");
});

test("interleaveByQuery returns everything when under the cap", () => {
  const items = [
    listing({ id: "ebay:1", matchedQuery: "a" }),
    listing({ id: "ebay:2", matchedQuery: "b" }),
    listing({ id: "ebay:3", matchedQuery: "b" }),
  ];
  assert.equal(interleaveByQuery(items, 60).length, 3);
});

test("shop degrades to an empty result when no source is configured", async () => {
  delete process.env.EBAY_CLIENT_ID;
  delete process.env.EBAY_CLIENT_SECRET;
  delete process.env.SERPAPI_KEY;

  const { listings, reports } = await shop(["waxed cotton jacket"], { min: 50, max: 250 });

  assert.equal(listings.length, 0);
  assert.equal(reports.length, 2, "both sources should still report in");
  assert.ok(
    reports.every((r) => r.configured === false && r.ok === true),
    "an unconfigured source is not a failed source"
  );
});

test("SerpAPI sees only the first few queries, because its free tier is 100 a month", () => {
  const queries = Array.from({ length: 10 }, (_, i) => `query ${i}`);

  assert.deepEqual(queriesFor("ebay", queries), queries, "eBay is not rate-limited this way");

  const asked = queriesFor("serpapi", queries);
  assert.equal(asked.length, 4);
  assert.deepEqual(asked, queries.slice(0, 4), "keeps the most central queries, not a sample");
});

test("the cap never invents queries when a run produces fewer than it allows", () => {
  assert.deepEqual(queriesFor("serpapi", ["one", "two"]), ["one", "two"]);
  assert.deepEqual(queriesFor("serpapi", []), []);
});
