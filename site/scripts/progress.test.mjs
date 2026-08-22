// The progress bar's arithmetic.
//
//   npm test
//
// A progress bar is a promise about the future, and the two ways to break that
// promise are going backwards and arriving early. Both are tested here, because
// neither is visible in a screenshot — you have to sit through a slow run to
// see a bar that hit 100% and waited, and by then it has already made the app
// look broken to somebody else.

import assert from "node:assert/strict";
import test from "node:test";
import { SPANS, elapsedLabel, reassurance, runProgress } from "../lib/progress.ts";

const STAGES = ["preparing", "analyzing", "shopping", "curating", "saving"];

test("the stages tile the bar end to end, in order, with no gaps", () => {
  // A gap is a jump; an overlap is a step backwards at a stage boundary.
  let cursor = 0;
  for (const stage of STAGES) {
    assert.equal(SPANS[stage].from, cursor, `${stage} does not start where the last one ended`);
    assert.ok(SPANS[stage].to > SPANS[stage].from, `${stage} has no width`);
    cursor = SPANS[stage].to;
  }
  assert.equal(cursor, 100, "the bar does not end at 100");
});

test("a stage never fills its own span, however long it runs", () => {
  // This is the whole design. A bar that reaches the end of a step before the
  // step finishes has to either stop or lie, and both read as a hang.
  for (const stage of STAGES) {
    for (const elapsed of [0, 1_000, 30_000, 600_000, 3_600_000]) {
      const value = runProgress(stage, elapsed);
      assert.ok(value < SPANS[stage].to, `${stage} reached its ceiling at ${elapsed}ms`);
      assert.ok(value >= SPANS[stage].from, `${stage} fell below its floor at ${elapsed}ms`);
    }
  }
});

test("it never reaches 100 while work is still happening", () => {
  for (const stage of STAGES) {
    assert.ok(runProgress(stage, 10_000_000) < 100);
  }
  assert.ok(runProgress("saving", 10_000_000, { done: 6, total: 6 }) < 100);
});

test("time only moves it forward", () => {
  for (const stage of STAGES) {
    let last = -1;
    for (let t = 0; t <= 120_000; t += 500) {
      const value = runProgress(stage, t);
      assert.ok(value >= last, `${stage} went backwards at ${t}ms`);
      last = value;
    }
  }
});

test("finished batches move it forward too", () => {
  let last = -1;
  for (let done = 0; done <= 6; done++) {
    const value = runProgress("curating", 1_000, { done, total: 6 });
    assert.ok(value >= last, `went backwards at ${done} of 6`);
    last = value;
  }
});

test("a real count beats the clock, but the clock still runs before the first one lands", () => {
  // The first batch can take twenty seconds. A bar pinned to done/total sits
  // motionless at the start of the span for that whole time, which is the exact
  // thing this is meant to fix.
  const early = runProgress("curating", 8_000, { done: 0, total: 6 });
  assert.ok(early > SPANS.curating.from, "nothing moved before the first batch");

  // Once real work lands and outpaces the clock, the real number wins.
  const ahead = runProgress("curating", 1_000, { done: 5, total: 6 });
  const clockOnly = runProgress("curating", 1_000);
  assert.ok(ahead > clockOnly, "five of six batches did not beat one second of clock");
});

test("every batch in is still not the whole stage", () => {
  // Curation being over is not the run being over — the closet still has to be
  // saved, and the bar should not have spent that span already.
  assert.ok(runProgress("curating", 30_000, { done: 6, total: 6 }) < SPANS.curating.to);
});

test("a nonsense count doesn't produce a nonsense bar", () => {
  for (const sub of [
    { done: 99, total: 6 },
    { done: -3, total: 6 },
    { done: 3, total: 0 },
    { done: 0, total: -1 },
  ]) {
    const value = runProgress("curating", 5_000, sub);
    assert.ok(Number.isFinite(value), `not a number for ${JSON.stringify(sub)}`);
    assert.ok(value >= SPANS.curating.from && value < SPANS.curating.to);
  }
});

test("the reassurance stays quiet until the wait is actually long", () => {
  assert.equal(reassurance(0), null);
  assert.equal(reassurance(24_000), null);
  assert.ok(reassurance(30_000));
  // And it escalates rather than repeating itself.
  assert.notEqual(reassurance(30_000), reassurance(90_000));
  assert.notEqual(reassurance(90_000), reassurance(180_000));
});

test("the timer reads like a clock", () => {
  assert.equal(elapsedLabel(0), "0:00");
  assert.equal(elapsedLabel(9_400), "0:09");
  assert.equal(elapsedLabel(64_000), "1:04");
  assert.equal(elapsedLabel(600_000), "10:00");
  // Never a negative or a NaN on screen, whatever the clock does.
  assert.equal(elapsedLabel(-5_000), "0:00");
});
