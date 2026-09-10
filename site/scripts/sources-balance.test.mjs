// Who fills the pool, and in what proportion.
//
//   npm test
//
// Every query goes to eBay and only the first few go to Google Shopping,
// because of SerpAPI's quota. Interleaving by query alone turned that quota
// into an editorial decision nobody made: the pool came back roughly seventy
// per cent secondhand marketplace and the finished closet inherited the
// ratio, which is why the results read as eBay with extra steps.

import assert from "node:assert/strict";
import test from "node:test";
import { balanceSources } from "../lib/sources/index.ts";
import { REGISTERS, renderLabels } from "../lib/labels.ts";

const item = (source, query, i) => ({
  id: `${source}-${query}-${i}`,
  source,
  title: `${query} ${i}`,
  price: 100,
  currency: "USD",
  url: `https://example.com/${source}/${query}/${i}`,
  matchedQuery: query,
});

const from = (source, queries, per) =>
  queries.flatMap((q) => Array.from({ length: per }, (_, i) => item(source, q, i)));

test("a source cannot own the pool by having been asked more questions", () => {
  // The real shape: ten eBay queries, four Google Shopping ones.
  const pool = balanceSources(
    [
      ...from("ebay", ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"], 30),
      ...from("serpapi", ["q1", "q2", "q3", "q4"], 30),
    ],
    120
  );

  const ebay = pool.filter((p) => p.source === "ebay").length;
  assert.equal(pool.length, 120);
  assert.equal(ebay, 60, "half, not seventy per cent");
});

test("one source alone still fills the whole pool", () => {
  const pool = balanceSources(from("ebay", ["q1", "q2", "q3"], 50), 120);
  assert.equal(pool.length, 120, "an unconfigured second source costs nothing");
});

test("a thin source is not padded, and the other takes the rest", () => {
  const pool = balanceSources(
    [...from("ebay", ["q1", "q2"], 50), ...from("serpapi", ["q1"], 4)],
    60
  );
  assert.equal(pool.length, 60);
  assert.equal(pool.filter((p) => p.source === "serpapi").length, 4, "all four, and no more");
});

test("garment types still take turns inside each source", () => {
  // Three queries per source, and the top of the pool should not be three of
  // the same query before the others get a look in.
  const pool = balanceSources(
    [...from("ebay", ["jacket", "shirt", "boots"], 10), ...from("serpapi", ["jacket", "shirt", "boots"], 10)],
    12
  );
  const queries = new Set(pool.slice(0, 6).map((p) => p.matchedQuery));
  assert.equal(queries.size, 3, "all three garment types appear in the first six");
});

test("the label vocabulary is registers of real labels, rendered one line each", () => {
  assert.ok(REGISTERS.length >= 6, "enough registers to cover a wardrobe");
  for (const register of REGISTERS) {
    assert.ok(register.labels.length >= 4, `${register.name} needs a few labels to spread across`);
    assert.ok(register.labels.every((l) => l.trim().length > 1));
  }
  const rendered = renderLabels();
  assert.equal(rendered.split("\n").length, REGISTERS.length);
  assert.ok(rendered.includes("Barbour") && rendered.includes("Carhartt"));
});
