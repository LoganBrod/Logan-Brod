// The taste memo is the only thing carrying a yes or a no into the next run, so
// what it renders is what the model sees. These pin the parts that are easy to
// get subtly wrong: which verdict wins when someone changes their mind, and how
// much of the history reaches the prompt.

import assert from "node:assert/strict";
import test from "node:test";
import {
  facetsOf,
  isValidTasteId,
  newTasteId,
  readTasteId,
  renderMemo,
  renderStats,
  wilson,
} from "../lib/taste.ts";

/** Votes are stored most-recent-first, which is the order renderMemo expects. */
const vote = (title, verdict) => ({ title, verdict, at: "2026-08-08T00:00:00.000Z" });

test("no votes means no memo, not an empty one", () => {
  assert.equal(renderMemo([]), null);
  assert.equal(renderMemo([{ title: "   ", verdict: "yes", at: "" }]), null);
});

test("both verdicts are rendered under their own heading", () => {
  const memo = renderMemo([vote("Barbour waxed jacket", "yes"), vote("Nylon track pant", "no")]);
  assert.match(memo, /said YES to:[\s\S]*Barbour waxed jacket/);
  assert.match(memo, /said NO to:[\s\S]*Nylon track pant/);
});

test("only one heading appears when only one verdict has been given", () => {
  const memo = renderMemo([vote("Red Wing moc toe", "yes")]);
  assert.match(memo, /said YES to/);
  assert.doesNotMatch(memo, /said NO to/);
});

test("changing your mind replaces the earlier verdict rather than adding to it", () => {
  // Newest first: the no came after the yes.
  const memo = renderMemo([vote("Suede chelsea boot", "no"), vote("Suede chelsea boot", "yes")]);
  assert.match(memo, /said NO to:[\s\S]*Suede chelsea boot/);
  assert.doesNotMatch(memo, /said YES to/);
});

test("the same title in different casing is the same item", () => {
  const memo = renderMemo([vote("OLIVE FIELD JACKET", "no"), vote("olive field jacket", "yes")]);
  assert.equal(memo.match(/olive field jacket/gi).length, 1);
});

test("each side is capped so a long history can't swamp the prompt", () => {
  const many = Array.from({ length: 40 }, (_, i) => vote(`Piece ${i}`, i % 2 ? "no" : "yes"));
  const memo = renderMemo(many);
  const yeses = memo.split("said NO to:")[0];
  const nos = memo.split("said NO to:")[1];
  assert.equal(yeses.match(/^- /gm).length, 15);
  assert.equal(nos.match(/^- /gm).length, 15);
});

test("the cap keeps the most recent votes, not the oldest", () => {
  const many = Array.from({ length: 40 }, (_, i) => vote(`Piece ${i}`, "yes"));
  const memo = renderMemo(many);
  assert.match(memo, /- Piece 0$/m, "the newest vote is kept");
  assert.doesNotMatch(memo, /- Piece 39$/m, "the oldest is dropped");
});

test("titles are truncated — eBay stuffs 80 characters of keywords into them", () => {
  const memo = renderMemo([vote("A".repeat(300), "yes")]);
  const titles = memo.split("\n").filter((line) => line.startsWith("- "));
  assert.equal(titles.length, 1);
  assert.ok(titles[0].length <= 92, `title line ran to ${titles[0].length} characters`);
});

test("a taste id is accepted only in the shape we mint, since it becomes a Redis key", () => {
  assert.ok(isValidTasteId(newTasteId()));
  assert.ok(!isValidTasteId("short"));
  assert.ok(!isValidTasteId("closet:ABC123*"), "no key-namespace characters");
  assert.ok(!isValidTasteId("a".repeat(65)));
});

test("the id is read out of a cookie header, and a junk one is ignored", () => {
  const id = newTasteId();
  assert.equal(readTasteId(`closet_code=ABC123; taste_id=${id}`), id);
  assert.equal(readTasteId("taste_id=nope*"), null);
  assert.equal(readTasteId(null), null);
});

// ------------------------------------------------------- attribute statistics

test("wilson carries the sample size, not just the rate", () => {
  const thin = wilson(1, 2);
  const thick = wilson(40, 80);
  // Same 50% point estimate; only one of them is worth acting on.
  assert.ok(thick.lo > thin.lo, "80 trials should be more confident than 2");
  assert.ok(thin.hi > thick.hi);
  assert.deepEqual(wilson(0, 0), { lo: 0, hi: 1 });
});

test("brand facets are keyed within their category", () => {
  assert.deepEqual(facetsOf({ category: "Jacket", brand: "Barbour", material: "Waxed Cotton" }), [
    "category:jacket",
    "material:waxed cotton",
    "brand:jacket|barbour",
  ]);
});

test("attributes the model didn't know don't become facets", () => {
  assert.deepEqual(facetsOf({ brand: "unknown", material: "  ", colour: "N/A" }), []);
  assert.deepEqual(facetsOf(undefined), []);
});

const counter = (over) => ({ shown: 0, opened: 0, clicked: 0, yes: 0, no: 0, ...over });

test("nothing is said about an attribute seen too few times", () => {
  // Four impressions and four clicks is a perfect record and still noise.
  assert.equal(renderStats({ "material:waxed cotton": counter({ shown: 4, clicked: 4 }) }), null);
});

test("a pattern clearly above average is reported with its counts", () => {
  const memo = renderStats({
    "material:waxed cotton": counter({ shown: 10, clicked: 8 }),
    "material:polyester": counter({ shown: 12, clicked: 0 }),
  });
  assert.match(memo, /Materials they go for: waxed cotton \(8 of 10\)/);
  assert.match(memo, /Materials they pass over: polyester \(0 of 12\)/);
});

test("an attribute sitting at the average isn't worth saying", () => {
  const memo = renderStats({
    "material:waxed cotton": counter({ shown: 20, clicked: 6 }),
    "material:moleskin": counter({ shown: 20, clicked: 6 }),
  });
  assert.equal(memo, null);
});

test("a yes counts as much as a click, and can't exceed impressions", () => {
  const memo = renderStats({
    "colour:olive": counter({ shown: 10, clicked: 9, yes: 9 }),
    "colour:magenta": counter({ shown: 10, clicked: 0 }),
  });
  // 18 hits over 10 impressions has to clamp, or the rate exceeds 1.
  assert.match(memo, /olive \(10 of 10\)/);
});

test("brand lines read as a maker within a category", () => {
  const memo = renderStats({
    "brand:jacket|barbour": counter({ shown: 8, clicked: 7 }),
    "brand:boot|generic": counter({ shown: 9, clicked: 0 }),
  });
  assert.match(memo, /Makers that land, by category: jacket barbour \(7 of 8\)/);
});

test("no statistics at all means no block", () => {
  assert.equal(renderStats({}), null);
});
