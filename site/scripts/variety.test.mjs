// The closet that came back as eight tan jackets.
//
//   npm test
//
// A real run produced twelve pieces that were, to look at, one piece: chore
// jacket, field jacket, work jacket, barn coat, all tan. Every existing rule
// passed it. The slot cap allows four outerwear, and the fifth and sixth
// escaped it because the model called them a shirt and an overshirt - which
// is not a mislabel, it is what the seller called them.
//
// This is the rule that catches what a person actually sees.

import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PICKS_PER_LOOK, capByLook, colourFamily } from "../lib/categories.ts";
import { rankAndCut } from "../lib/batching.ts";

const piece = (category, colour, score) => ({
  id: `${category}-${colour}-${score}`,
  score,
  price: 100,
  attrs: { category, colour },
});

test("the words sellers use for one colour collapse into one family", () => {
  for (const word of ["tan", "khaki", "beige", "sand", "camel", "washed stone", "light oatmeal"]) {
    assert.equal(colourFamily(word), "tan", `${word} is tan`);
  }
  assert.equal(colourFamily("olive"), "green");
  assert.equal(colourFamily("dark olive green"), "green");
  assert.equal(colourFamily("charcoal"), "grey");
  assert.equal(colourFamily("washed indigo"), "navy");
  assert.equal(colourFamily("oxblood"), "red");
});

test("an unnamed colour is not a look, and is never capped", () => {
  assert.equal(colourFamily(""), "unknown");
  assert.equal(colourFamily(undefined), "unknown");
  assert.equal(colourFamily("iridescent"), "unknown");

  const items = Array.from({ length: 6 }, (_, i) => ({ look: "tops|unknown", i }));
  assert.equal(capByLook(items, (x) => x.look).length, 6, "a run that named no colours survives");
});

test("eight tan jackets come back as three", () => {
  // The closet from the screenshot: called a jacket, a coat, an overshirt and
  // a shirt, in five words for one colour, and all of them the same
  // photograph. Six of the eight are outerwear and two survive that.
  //
  // Three rather than two because of the one called a shirt, and that is the
  // rule working rather than failing: a tan shirt and a tan jacket really are
  // different garments, so they cannot share a cap. It is also the residual
  // gap - a chore jacket the model calls a shirt buys itself one extra place,
  // and nothing short of looking at the photograph again can tell the
  // difference.
  const closet = rankAndCut([
    piece("jacket", "tan", 92),
    piece("jacket", "khaki", 91),
    piece("coat", "sand", 90),
    piece("jacket", "camel", 89),
    piece("shirt", "tan", 88),
    piece("overshirt", "beige", 87),
    piece("coat", "tan", 86),
    piece("jacket", "stone", 85),
  ]);

  assert.deepEqual(
    closet.map((c) => c.score),
    [92, 91, 88],
    "the best two outerwear and the one thing that is not outerwear"
  );
  assert.equal(closet.filter((c) => c.attrs.category !== "shirt").length, MAX_PICKS_PER_LOOK);
});

test("a monochrome wardrobe is still allowed, so long as it is not one garment", () => {
  // Everything olive, which is a real taste rather than a failure - it just
  // has to be different garments.
  const closet = rankAndCut([
    piece("jacket", "olive", 95),
    piece("jacket", "olive", 94),
    piece("shirt", "olive", 93),
    piece("knitwear", "olive", 92),
    piece("trousers", "olive", 91),
    piece("jeans", "olive", 90),
    piece("boots", "olive", 89),
    piece("sneakers", "olive", 88),
  ]);

  assert.equal(closet.length, 8, "four slots, two of each, all one colour");
});

test("the cap removes the weakest of a look, never the best", () => {
  const closet = rankAndCut([
    piece("jacket", "navy", 70),
    piece("jacket", "navy", 95),
    piece("jacket", "navy", 80),
  ]);
  assert.deepEqual(closet.map((c) => c.score), [95, 80]);
});

test("a page of one slot can opt out, which is what accessories does", () => {
  const belts = Array.from({ length: 6 }, (_, i) => piece("belt", "brown", 90 - i));
  assert.equal(rankAndCut(belts, 12, 12, 12).length, 6);
  assert.equal(rankAndCut(belts, 12, 12).length, MAX_PICKS_PER_LOOK, "and the closet's rule still bites");
});

// --------------------------------------------------------------- duplicates

const listing = (title, colour, score, extra = {}) => ({
  id: `${title}-${score}`,
  title,
  score,
  price: extra.price ?? 100,
  imageUrl: extra.imageUrl,
  attrs: { category: extra.category ?? "jacket", colour },
});

test("the same jacket from two sellers at two prices appears once", () => {
  const closet = rankAndCut([
    listing("Barbour Bedale Waxed Jacket Mens Size 40", "olive", 90, { price: 90 }),
    listing("Barbour Bedale waxed jacket size L", "olive", 88, { price: 95 }),
    listing("Shetland wool crewneck", "grey", 86, { category: "knitwear" }),
    listing("Wool flannel trousers", "grey", 84, { category: "trousers" }),
  ]);

  assert.equal(closet.length, 3, "one Bedale, not two");
  assert.equal(closet.filter((c) => /bedale/i.test(c.title)).length, 1);
});

test("one photograph is one product, whatever the titles say", () => {
  const photo = "https://i.ebayimg.com/images/g/abc/s-l500.jpg";
  const closet = rankAndCut([
    listing("Vintage field jacket", "olive", 90, { imageUrl: photo }),
    listing("Army surplus M65 coat", "olive", 89, { imageUrl: photo }),
    listing("Shetland wool crewneck", "grey", 88, { category: "knitwear" }),
  ]);
  assert.equal(closet.length, 2, "nobody photographs two garments into one URL");
});

test("two genuinely different garments are not collapsed", () => {
  const closet = rankAndCut([
    listing("Carhartt Detroit jacket", "brown", 90),
    listing("Carhartt chore coat", "brown", 89),
  ]);
  assert.equal(closet.length, 2);
});

test("a short closet does not become half jackets", () => {
  // Eight pieces, five of them outerwear across three colours. The old cap of
  // four let four of eight through, which is a page of jackets.
  const closet = rankAndCut([
    listing("Field jacket", "olive", 95),
    listing("Chore coat", "tan", 94),
    listing("Bomber jacket", "navy", 93),
    listing("Barn coat", "olive", 92),
    listing("Harrington jacket", "navy", 91),
    listing("Oxford shirt", "blue", 90, { category: "shirt" }),
    listing("Wool trousers", "grey", 89, { category: "trousers" }),
    listing("Suede chukka boots", "brown", 88, { category: "boots" }),
  ]);

  const outerwear = closet.filter((c) => ["Field jacket", "Chore coat", "Bomber jacket", "Barn coat", "Harrington jacket"].includes(c.title));
  assert.ok(outerwear.length <= 3, `outerwear capped at three, got ${outerwear.length}`);
  assert.ok(closet.length >= 5, "and the rest of the closet survives");
});
