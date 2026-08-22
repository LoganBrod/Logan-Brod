// The calibration deck.
//
//   npm test
//
// The taste memory is the strongest signal this app has, and it only exists
// after somebody has built a closet and reacted to it — so the first run, the
// one that decides whether anyone comes back, is the run with none of it.

import assert from "node:assert/strict";
import test from "node:test";
import { CALIBRATION_PROBES, CARDS, dealCards } from "../lib/calibration.ts";

test("the probes span registers rather than flattering one", () => {
  // A set everybody likes teaches nothing. The point is that a man who says yes
  // to tailoring and no to cargo trousers has told us something the next man's
  // answers contradict.
  const registers = new Set(CALIBRATION_PROBES.map((p) => p.register));
  assert.ok(registers.size >= 5, `only ${registers.size} registers represented`);
});

test("no slot dominates the deck", () => {
  const counts = new Map();
  for (const probe of CALIBRATION_PROBES) {
    counts.set(probe.slot, (counts.get(probe.slot) ?? 0) + 1);
  }
  assert.ok(counts.size >= 4, "the probes don't span enough of an outfit");
  for (const [slot, n] of counts) {
    assert.ok(
      n <= CALIBRATION_PROBES.length / 3,
      `${slot} is ${n} of ${CALIBRATION_PROBES.length} probes — the deck would feel like one question`
    );
  }
});

test("every probe names a real garment, not a category", () => {
  // These go straight into a shopping search. "Men's shoes" returns ten
  // thousand things and teaches nothing about anybody.
  for (const probe of CALIBRATION_PROBES) {
    assert.ok(probe.query.split(" ").length >= 3, `"${probe.query}" is too vague to be a probe`);
    assert.equal(probe.query, probe.query.toLowerCase(), `"${probe.query}" isn't lowercase`);
  }
});

const card = (slot, id) => ({ slot, id });

test("the deck alternates instead of running four jackets together", () => {
  // A run of one kind makes it feel like the same question repeatedly, and
  // people start swiping without looking — which is worse than no data,
  // because it's confident noise.
  const items = [
    ...Array.from({ length: 4 }, (_, i) => card("outerwear", `o${i}`)),
    ...Array.from({ length: 4 }, (_, i) => card("tops", `t${i}`)),
    ...Array.from({ length: 4 }, (_, i) => card("bottoms", `b${i}`)),
  ];
  const dealt = dealCards(items, 12);
  for (let i = 2; i < dealt.length; i++) {
    const run = dealt[i].slot === dealt[i - 1].slot && dealt[i - 1].slot === dealt[i - 2].slot;
    assert.ok(!run, `three ${dealt[i].slot} in a row at position ${i}`);
  }
});

test("it deals up to the limit and no further", () => {
  const items = Array.from({ length: 40 }, (_, i) => card(["a", "b", "c"][i % 3], i));
  assert.equal(dealCards(items, CARDS).length, CARDS);
  assert.equal(dealCards(items, 5).length, 5);
});

test("a thin day deals what there is rather than looping", () => {
  // Every search can come back empty; the deck should shrink, not repeat.
  const items = [card("tops", 1), card("bottoms", 2)];
  const dealt = dealCards(items, CARDS);
  assert.equal(dealt.length, 2);
  assert.equal(new Set(dealt.map((d) => d.id)).size, 2, "a card was dealt twice");
});

test("one slot's worth still deals", () => {
  const items = Array.from({ length: 5 }, (_, i) => card("outerwear", i));
  assert.equal(dealCards(items, CARDS).length, 5);
});

test("untagged listings don't disappear", () => {
  const dealt = dealCards([{ id: "a" }, { id: "b" }], CARDS);
  assert.equal(dealt.length, 2);
});

test("nothing in, nothing out", () => {
  assert.deepEqual(dealCards([], CARDS), []);
});
