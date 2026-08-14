// The owned wardrobe is painted from these, so a wrong answer here is a wrong
// colour on someone's own clothes.

import assert from "node:assert/strict";
import test from "node:test";
import {
  UNKNOWN_COLOUR,
  garmentColour,
  isDark,
  shift,
} from "../lib/garmentColour.ts";

test("every swatch in the table is a real hex", () => {
  // The table is hand-written, and a malformed entry would render as a
  // transparent bag rather than as an error anyone would notice.
  const seen = new Set();
  for (const name of [
    "black", "charcoal", "grey", "slate", "white", "ecru", "cream", "oatmeal",
    "sand", "stone", "beige", "taupe", "camel", "tan", "khaki", "brown",
    "navy", "blue", "denim", "teal", "green", "olive", "sage", "forest",
    "burgundy", "maroon", "red", "rust", "orange", "pink", "purple", "mustard",
  ]) {
    const hex = garmentColour(name);
    assert.match(hex, /^#[0-9a-f]{6}$/i, `${name} resolved to ${hex}`);
    assert.notEqual(hex, UNKNOWN_COLOUR, `${name} should be in the table`);
    seen.add(name);
  }
  assert.equal(seen.size, 32);
});

test("the last colour word wins, the way it reads out loud", () => {
  // "navy blue" is navy; "blue-grey" is a grey.
  assert.equal(garmentColour("navy blue"), garmentColour("blue"));
  assert.equal(garmentColour("blue grey"), garmentColour("grey"));
});

test("modifiers shift a base rather than replacing it", () => {
  const base = garmentColour("grey");
  assert.notEqual(garmentColour("light grey"), base);
  assert.notEqual(garmentColour("dark grey"), base);
  // Lighter is lighter and darker is darker, not merely different.
  assert.ok(isDark(garmentColour("dark grey")));
  assert.ok(!isDark(garmentColour("pale grey")));
});

test("'mid' is a menswear word meaning leave it alone", () => {
  assert.equal(garmentColour("mid-grey"), garmentColour("grey"));
});

test("an unreadable colour is undecided, never confidently wrong", () => {
  assert.equal(garmentColour("iridescent"), UNKNOWN_COLOUR);
  assert.equal(garmentColour(""), UNKNOWN_COLOUR);
  assert.equal(garmentColour("   "), UNKNOWN_COLOUR);
});

test("it reads a whole description, not just a bare colour", () => {
  assert.equal(garmentColour("a mid-grey wool crewneck"), garmentColour("grey"));
  assert.equal(garmentColour("waxed cotton field jacket in olive"), garmentColour("olive"));
});

test("shift moves toward white and black without leaving the range", () => {
  assert.equal(shift("#808080", 1), "#ffffff");
  assert.equal(shift("#808080", -1), "#000000");
  assert.equal(shift("#808080", 0), "#808080");
  for (const amount of [-1, -0.5, 0, 0.5, 1]) {
    assert.match(shift("#3F5B3A", amount), /^#[0-9a-f]{6}$/);
  }
});

test("isDark picks a legible label colour", () => {
  assert.ok(isDark(garmentColour("black")));
  assert.ok(isDark(garmentColour("navy")));
  assert.ok(!isDark(garmentColour("cream")));
  assert.ok(!isDark(garmentColour("oatmeal")));
});
