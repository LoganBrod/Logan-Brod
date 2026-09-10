// Secondhand, new, or both.
//
//   npm test
//
// One setting with three positions, controlling two things that are really
// the same question: which sources are worth running, and which conditions
// eBay is allowed to return. eBay is the only source carrying both, so
// leaving its condition filter alone would make "new" mean "new, plus
// whatever eBay felt like".

import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MARKET, MARKETS, asMarket, conditionIdsFor, isMarket, sourcesFor } from "../lib/market.ts";
import { cleanPreferences } from "../lib/preferences.ts";

test("three positions, and anything else is the default", () => {
  assert.deepEqual(MARKETS.map((m) => m.value), ["secondhand", "mix", "new"]);
  assert.equal(DEFAULT_MARKET, "mix", "both, unless somebody says otherwise");
  for (const bad of ["", "used", null, undefined, 7, "SECONDHAND"]) {
    assert.equal(isMarket(bad), false);
    assert.equal(asMarket(bad), DEFAULT_MARKET);
  }
  assert.equal(asMarket("secondhand"), "secondhand");
});

test("a secondhand run never asks a brand's own shop", () => {
  const asked = sourcesFor("secondhand");
  assert.deepEqual(asked, ["ebay"]);
  assert.ok(!asked.includes("shopify"), "a shop sells new stock; asking would spend a call to discard it");
});

test("a new run asks the shops and the retail index, and eBay too", () => {
  const asked = sourcesFor("new");
  assert.ok(asked.includes("shopify") && asked.includes("serpapi"));
  assert.ok(asked.includes("ebay"), "eBay carries new stock as well, and its filter handles the rest");
});

test("both asks everybody", () => {
  assert.deepEqual(sourcesFor("mix").sort(), ["ebay", "serpapi", "shopify"]);
});

test("the condition filter means what the setting says", () => {
  const used = conditionIdsFor("secondhand");
  const fresh = conditionIdsFor("new");
  const both = conditionIdsFor("mix");

  assert.ok(!used.includes("1000"), "no brand-new listings in a secondhand run");
  assert.ok(used.includes("3000"), "used is the point of it");
  assert.ok(fresh.includes("1000"));
  assert.ok(!fresh.includes("3000"), "and no worn ones in a new run");
  // Refurbished has been owned; somebody who asked for new meant from the brand.
  assert.ok(!fresh.includes("2000") && used.includes("2000"));
  assert.equal(both.length, used.length + fresh.length, "both is exactly the two together");
  for (const set of [used, fresh, both]) {
    assert.ok(!set.includes("7000"), "for parts is never what anybody meant");
  }
});

test("the choice is remembered, and a broken one costs only itself", () => {
  assert.equal(cleanPreferences({ market: "new" }).market, "new");
  assert.equal(cleanPreferences({ market: "vintage" }).market, undefined);
  const kept = cleanPreferences({ market: "nonsense", brands: "Barbour" });
  assert.equal(kept.market, undefined);
  assert.equal(kept.brands, "Barbour", "one bad answer must not cost the others");
});

test("a source the setting sat out is not reported as having found nothing", async () => {
  process.env.EBAY_CLIENT_ID = "x";
  process.env.EBAY_CLIENT_SECRET = "y";
  process.env.SHOPIFY_STORES = "example.com";
  const { shop } = await import("../lib/sources/index.ts");

  const { reports } = await shop(["waxed cotton jacket"], { min: 50, max: 250 }, { market: "secondhand" });
  const shopify = reports.find((r) => r.source === "shopify");

  assert.equal(shopify.configured, true, "it is configured");
  assert.equal(shopify.asked, false, "and it was simply not asked");
  // What the closet page does with this: a configured source that came back
  // empty is trouble worth mentioning; one that was never asked is not.
  const trouble = reports.filter((r) => r.configured && r.asked !== false && (!r.ok || r.count === 0));
  assert.ok(!trouble.some((r) => r.source === "shopify"));
});
