// Reading sizes out of listing titles, and deciding what can't fit.
//
//   npm test
//
// The bias under test is timidity: a title that says nothing about size must
// survive, because dropping a wearable piece costs more than passing an
// unwearable one to a curation pass that also reads the title.

import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanSizes,
  conflictsWithSizes,
  hasSizes,
  normalizeLetter,
  renderSizes,
  sizesInTitle,
} from "../lib/sizing.ts";

test("letter sizes are read however the seller wrote them", () => {
  assert.equal(sizesInTitle("Barbour Beaufort Waxed Jacket Size L Olive").letter, "L");
  assert.equal(sizesInTitle("J.Crew Oxford Shirt sz: XL").letter, "XL");
  assert.equal(sizesInTitle("Shetland Crewneck SIZE MEDIUM Navy").letter, "M");
  assert.equal(sizesInTitle("Filson Mackinaw Cruiser XXL").letter, "2XL");
});

test("a size word buried in prose isn't a size", () => {
  // "Large" here is describing the pockets, and "l" appears inside words
  // constantly — only a labelled or standalone upper-case token counts.
  assert.equal(sizesInTitle("Field Jacket with Large Bellows Pockets").letter, undefined);
  assert.equal(sizesInTitle("Wool Flannel Overshirt in Charcoal").letter, undefined);
});

test("denim measurements are read as a pair", () => {
  assert.deepEqual(
    { ...sizesInTitle("Levi's 501 Original Fit Jeans 34x32 Dark Wash") },
    { waist: 34, inseam: 32 }
  );
  const w = sizesInTitle("Carhartt Double Knee Pant W36 L30");
  assert.equal(w.waist, 36);
  assert.equal(w.inseam, 30);
});

test("a jacket size needs its length letter", () => {
  assert.equal(sizesInTitle("Brooks Brothers Harris Tweed Sport Coat 42R").chest, 42);
  // Bare two-digit numbers are model numbers, years, and prices far more often
  // than they are chest measurements.
  assert.equal(sizesInTitle("Vintage 1970s Tweed Jacket 42 Brown").chest, undefined);
});

test("a shoe size has to announce itself", () => {
  assert.equal(sizesInTitle("Red Wing Iron Ranger US 10 Amber").shoe, 10);
  assert.equal(sizesInTitle("Alden Indy Boot 10.5D Brown").shoe, 10.5);
  assert.equal(sizesInTitle("Clarks Desert Boot Beeswax Leather").shoe, undefined);
});

test("a title with no size never conflicts", () => {
  const sizes = { tops: "L", waist: 32, inseam: 32, shoe: 10 };
  assert.equal(conflictsWithSizes("Barbour Beaufort Waxed Cotton Jacket Olive", sizes), false);
});

test("one letter either way is still wearable", () => {
  assert.equal(conflictsWithSizes("Shetland Crewneck Size M", { tops: "L" }), false);
  assert.equal(conflictsWithSizes("Shetland Crewneck Size XL", { tops: "L" }), false);
  assert.equal(conflictsWithSizes("Shetland Crewneck Size XS", { tops: "L" }), true);
  assert.equal(conflictsWithSizes("Shetland Crewneck Size 3XL", { tops: "L" }), true);
});

test("a waist two inches out survives, four doesn't", () => {
  assert.equal(conflictsWithSizes("Levi's 501 34x32", { waist: 32, inseam: 32 }), false);
  assert.equal(conflictsWithSizes("Levi's 501 38x32", { waist: 32, inseam: 32 }), true);
});

test("a long inseam can be taken up; a short one can't", () => {
  assert.equal(conflictsWithSizes("Levi's 501 32x34", { waist: 32, inseam: 32 }), false);
  assert.equal(conflictsWithSizes("Levi's 501 32x28", { waist: 32, inseam: 32 }), true);
});

test("shoes have almost no tolerance", () => {
  assert.equal(conflictsWithSizes("Red Wing Iron Ranger US 10.5", { shoe: 10 }), false);
  assert.equal(conflictsWithSizes("Red Wing Iron Ranger US 12", { shoe: 10 }), true);
});

test("a size nobody stated a preference for can't conflict", () => {
  assert.equal(conflictsWithSizes("Red Wing Iron Ranger US 12", { tops: "L" }), false);
});

test("cleanSizes throws out anything it wouldn't have written", () => {
  assert.deepEqual(cleanSizes({ tops: "large", waist: "34", inseam: 32, shoe: 10.4 }), {
    tops: "L",
    waist: 34,
    inseam: 32,
    shoe: 10.5,
  });
  assert.deepEqual(cleanSizes({ tops: "enormous", waist: 900, shoe: -3 }), {});
  assert.deepEqual(cleanSizes(null), {});
});

test("jacket sizes keep their length letter", () => {
  assert.equal(cleanSizes({ jacket: "42 r" }).jacket, "42R");
  assert.equal(cleanSizes({ jacket: "99XL" }).jacket, undefined);
});

test("normalizeLetter is the only way a letter size enters", () => {
  assert.equal(normalizeLetter("x-large"), "XL");
  assert.equal(normalizeLetter("XXL"), "2XL");
  assert.equal(normalizeLetter("huge"), null);
  assert.equal(normalizeLetter(undefined), null);
});

test("nothing filled in means nothing to say", () => {
  assert.equal(hasSizes({}), false);
  assert.equal(hasSizes(null), false);
  assert.equal(renderSizes({}), null);
  assert.match(renderSizes({ tops: "L", shoe: 10 }), /tops and knitwear L.*shoes US 10/);
});
