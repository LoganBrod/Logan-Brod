// Per-query outcomes: the pure parts.
//
//   npm test
//
// Everything that touches Redis in lib/yield.ts is best-effort and swallows
// its own errors, so what can be tested is what must be right: how queries
// are keyed, how increments merge, and which run ids are believed.

import assert from "node:assert/strict";
import test from "node:test";
import { isValidRunId, merge, slugOf } from "../lib/yield.ts";

test("the same search written three ways shares one record", () => {
  const a = slugOf("Waxed cotton field jacket, olive");
  const b = slugOf("waxed cotton field jacket olive");
  const c = slugOf("  waxed  cotton   field-jacket olive!  ");
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a, "waxed cotton field jacket olive");
});

test("slugs are short enough to be keys and empty when there is nothing to key", () => {
  assert.equal(slugOf("x".repeat(200)).length, 80);
  assert.equal(slugOf("!!! ???"), "");
  assert.equal(slugOf(""), "");
});

test("merge starts a fresh record and adds to an existing one", () => {
  const t0 = "2026-09-01T00:00:00.000Z";
  const t1 = "2026-09-02T00:00:00.000Z";
  const first = merge(null, "selvedge denim jacket", { runs: 1, found: 14 }, t0);
  assert.equal(first.runs, 1);
  assert.equal(first.found, 14);
  assert.equal(first.viewed, 0);
  assert.equal(first.first, t0);
  assert.equal(first.last, t0);

  const second = merge(first, "selvedge denim jacket", { viewed: 9, picked: 2, scoreSum: 150 }, t1);
  assert.equal(second.found, 14, "untouched fields carry over");
  assert.equal(second.viewed, 9);
  assert.equal(second.picked, 2);
  assert.equal(second.scoreSum, 150);
  assert.equal(second.first, t0, "first sighting never moves");
  assert.equal(second.last, t1);
  assert.equal(first.viewed, 0, "merge does not mutate its input");
});

test("merge ignores what is not a finite number", () => {
  const rec = merge(null, "q", { found: Number.NaN, viewed: Infinity, picked: 3 }, "2026-09-01T00:00:00.000Z");
  assert.equal(rec.found, 0);
  assert.equal(rec.viewed, 0);
  assert.equal(rec.picked, 3);
});

test("run ids are believed only in the one shape the browser mints", () => {
  assert.ok(isValidRunId("run_1725000000_a1b2c3"));
  assert.ok(isValidRunId("A".repeat(64)));
  assert.equal(isValidRunId("short"), false);
  assert.equal(isValidRunId("A".repeat(65)), false);
  assert.equal(isValidRunId("has space here"), false);
  assert.equal(isValidRunId("yield:index"), false, "a colon would let a run id collide with a key");
  assert.equal(isValidRunId(12345678), false);
  assert.equal(isValidRunId(null), false);
});
