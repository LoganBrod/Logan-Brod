// The taste memo is the only thing carrying a yes or a no into the next run, so
// what it renders is what the model sees. These pin the parts that are easy to
// get subtly wrong: which verdict wins when someone changes their mind, and how
// much of the history reaches the prompt.

import assert from "node:assert/strict";
import test from "node:test";
import { isValidTasteId, newTasteId, readTasteId, renderMemo } from "../lib/taste.ts";

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
