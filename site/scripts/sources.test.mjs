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

test("both sources reach the candidate pool, not just the first one merged", () => {
  // The shape of a real run: eBay answers all ten queries with thirty items
  // each, Google Shopping answers the first four with twenty-four, and eBay's
  // results are merged first because its source is listed first.
  //
  // Bucketing on the query alone made every bucket read [30 eBay, 24 retail].
  // The round-robin drains position 0 of each bucket, then position 1, and a
  // 120 cap over ten queries never reaches position 12 — so Google Shopping
  // could be configured, working and billed without a single one of its
  // listings ever being seen.
  const listings = [];
  for (let q = 0; q < 10; q += 1) {
    for (let i = 0; i < 30; i += 1) {
      listings.push(listing({ id: `ebay:${q}-${i}`, source: "ebay", matchedQuery: `query ${q}` }));
    }
  }
  for (let q = 0; q < 4; q += 1) {
    for (let i = 0; i < 24; i += 1) {
      listings.push(
        listing({ id: `serp:${q}-${i}`, source: "serpapi", matchedQuery: `query ${q}` })
      );
    }
  }

  const pool = interleaveByQuery(listings, 120);
  const retail = pool.filter((item) => item.source === "serpapi");
  assert.ok(retail.length > 0, "no retail listing survived the merge");

  // And it has to survive the part curation actually looks at, which is only
  // the first few batches' worth.
  const seen = pool.slice(0, 48).filter((item) => item.source === "serpapi");
  assert.ok(seen.length > 0, "retail listings existed but none reached curation");
});

test("one source can't take a query's whole share", () => {
  const listings = [
    ...Array.from({ length: 10 }, (_, i) =>
      listing({ id: `ebay:${i}`, source: "ebay", matchedQuery: "boots" })
    ),
    ...Array.from({ length: 10 }, (_, i) =>
      listing({ id: `serp:${i}`, source: "serpapi", matchedQuery: "boots" })
    ),
  ];

  const pool = interleaveByQuery(listings, 6);
  assert.equal(pool.filter((item) => item.source === "ebay").length, 3);
  assert.equal(pool.filter((item) => item.source === "serpapi").length, 3);
});

test("per-query fairness survives the source interleave", () => {
  // The original guarantee: one broad query can't starve the narrow ones.
  const listings = [
    ...Array.from({ length: 50 }, (_, i) =>
      listing({ id: `a${i}`, source: "ebay", matchedQuery: "broad" })
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      listing({ id: `b${i}`, source: "ebay", matchedQuery: "narrow" })
    ),
  ];

  const pool = interleaveByQuery(listings, 10);
  assert.equal(pool.filter((item) => item.matchedQuery === "narrow").length, 4);
});

test("a source that answers only some queries doesn't distort the others", () => {
  const listings = [
    ...Array.from({ length: 6 }, (_, i) =>
      listing({ id: `e${i}`, source: "ebay", matchedQuery: i < 3 ? "covered" : "uncovered" })
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      listing({ id: `s${i}`, source: "serpapi", matchedQuery: "covered" })
    ),
  ];

  const pool = interleaveByQuery(listings, 9);
  assert.equal(pool.filter((item) => item.matchedQuery === "uncovered").length, 3);
  assert.equal(pool.length, 9);
});
