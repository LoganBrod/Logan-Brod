// The owned wardrobe: how it reads back into a prompt, and how outfits are
// defended against a model referring to a garment nobody has.
//
//   npm test

import assert from "node:assert/strict";
import test from "node:test";
import { renderOwned } from "../lib/wardrobeOwned.ts";

const garment = (over) => ({
  id: "x",
  addedAt: "2026-08-01T00:00:00.000Z",
  label: "field jacket",
  category: "jacket",
  colour: "olive",
  material: "waxed cotton",
  formality: "casual",
  season: "cold",
  ...over,
});

test("an empty wardrobe says nothing rather than saying it's empty", () => {
  // A prompt that announces "they own nothing" is worse than one that doesn't
  // raise the subject — it invites the model to fill a void.
  assert.equal(renderOwned([]), null);
});

test("the inventory is grouped by category, the way gaps are reasoned about", () => {
  const memo = renderOwned([
    garment({ label: "field jacket" }),
    garment({ label: "chore coat", colour: "navy" }),
    garment({ category: "boots", label: "chelsea boot", colour: "brown", material: "suede" }),
  ]);

  assert.match(memo, /jacket: .*field jacket.*chore coat/s);
  assert.match(memo, /boots: .*chelsea boot/);
});

test("it says plainly not to recommend what they already have", () => {
  // Without this a model given a list of clothes will happily suggest a fourth
  // navy crewneck.
  const memo = renderOwned([garment({})]);
  assert.match(memo, /already have/i);
});

test("a long wardrobe doesn't run away with the prompt", () => {
  const many = Array.from({ length: 40 }, (_, i) => garment({ label: `jacket ${i}` }));
  const memo = renderOwned(many);
  const line = memo.split("\n").find((l) => l.startsWith("- jacket:"));
  assert.ok(line.split(";").length <= 12, "one category should be capped");
});

test("duplicate descriptions survive — two navy crewnecks is a fact worth knowing", () => {
  const memo = renderOwned([
    garment({ category: "knitwear", label: "crewneck", colour: "navy", material: "merino" }),
    garment({ category: "knitwear", label: "crewneck", colour: "navy", material: "merino" }),
  ]);
  assert.equal(memo.match(/crewneck/g).length, 2);
});
