// Where the pieces hang, checked against the measured cavity.
//
//   npm test
//
// These are the numbers the whole results view is built on: garments are
// positioned in fractions of the clip's final frame, so a layout that drifts
// outside CARCASS hangs clothes through the side of the wardrobe. The browser
// check asserts the same thing against real rendered rects — this catches it
// first, and much faster.

import assert from "node:assert/strict";
import test from "node:test";
import { CARCASS, FRAME_ASPECT, RAIL, layout } from "../lib/wardrobe.ts";

/** Pixel height over pixel width, once the frame's own aspect is accounted for. */
const drawnRatio = ({ width, height }) => height / (width * FRAME_ASPECT);

test("everything hangs inside the cavity", () => {
  for (let count = 1; count <= 12; count += 1) {
    const { width, height, slots } = layout(count);
    assert.equal(slots.length, count, `count ${count}`);

    for (const slot of slots) {
      assert.ok(slot.x - width / 2 >= CARCASS.left, `count ${count}: hangs off the left`);
      assert.ok(slot.x + width / 2 <= CARCASS.right, `count ${count}: hangs off the right`);
      assert.ok(slot.y >= RAIL.y, `count ${count}: hangs above the rail`);
      assert.ok(slot.y + height <= CARCASS.bottom, `count ${count}: hangs through the floor`);
    }
  }
});

test("a bag is always taller than it is wide, and never a sliver", () => {
  // The whole point of the two-row layout: a bag shaped like a sliver fits a
  // square photo to its width and leaves it floating in a column of white.
  for (let count = 1; count <= 12; count += 1) {
    const ratio = drawnRatio(layout(count));
    assert.ok(ratio > 1, `count ${count}: ${ratio} is wider than it is tall`);
    assert.ok(ratio < 1.6, `count ${count}: ${ratio} is a sliver`);
  }
});

test("the shape holds no matter how many pieces there are", () => {
  const ratios = [1, 4, 6, 8, 10].map((count) => drawnRatio(layout(count)));
  for (const ratio of ratios) {
    assert.ok(Math.abs(ratio - ratios[0]) < 0.001, "bags changed shape with the count");
  }
});

test("four or more pieces hang on two rails", () => {
  assert.equal(layout(3).rowYs.length, 1);
  assert.equal(layout(4).rowYs.length, 2);
  assert.equal(layout(8).rowYs.length, 2);

  const eight = layout(8);
  assert.deepEqual(
    eight.slots.map((slot) => slot.row),
    [0, 0, 0, 0, 1, 1, 1, 1]
  );
});

test("an odd count leaves the short row on the bottom", () => {
  const seven = layout(7);
  assert.deepEqual(
    seven.slots.map((slot) => slot.row),
    [0, 0, 0, 0, 1, 1, 1]
  );
});

test("the second rail clears the first row's hems", () => {
  for (const count of [4, 6, 8, 10, 12]) {
    const { height, rowYs } = layout(count);
    assert.ok(rowYs[1] > rowYs[0] + height, `count ${count}: the rows overlap`);
  }
});

test("two rows make every bag meaningfully bigger than one would", () => {
  // Eight in a row was 0.056 of the frame wide — about 55px on the page, which
  // is what made the photos unreadable.
  const { width } = layout(8);
  assert.ok(width > 0.1, `${width} is no better than a single row`);
});

test("a lone piece isn't inflated into a slab", () => {
  const { width } = layout(1);
  assert.ok(width <= 0.11, `${width} is too wide`);
  assert.equal(layout(1).slots[0].x, (RAIL.left + RAIL.right) / 2);
});

test("no pieces, no layout", () => {
  const empty = layout(0);
  assert.deepEqual(empty.slots, []);
  assert.deepEqual(empty.rowYs, []);
});
