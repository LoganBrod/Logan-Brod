// Per-query outcomes: the pure parts.
//
//   npm test
//
// The pure parts: how queries are keyed, what one write sends, how a record
// reads back, and which run ids are believed. The concurrency that broke the
// first version is covered in yield-roundtrip.test.mjs against the fake
// Upstash.

import assert from "node:assert/strict";
import test from "node:test";
import { deltaCommands, fromHash, isValidRunId, slugOf } from "../lib/yield.ts";

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

test("one delta becomes one pipeline: increments, timestamps, index, expiry", () => {
  const now = "2026-09-01T00:00:00.000Z";
  const commands = deltaCommands("selvedge denim jacket", "Selvedge denim jacket", { runs: 1, found: 14, scoreSum: 0 }, now);
  const names = commands.map((c) => c[0]);
  assert.deepEqual(names, ["HSETNX", "HSETNX", "HSET", "HINCRBY", "HINCRBY", "EXPIRE", "SADD", "EXPIRE"]);
  assert.deepEqual(commands[0].slice(1), ["yield:q:selvedge denim jacket", "query", "Selvedge denim jacket"]);
  assert.deepEqual(commands[1].slice(1), ["yield:q:selvedge denim jacket", "first", now], "first sighting is set only if absent");
  assert.deepEqual(commands[2].slice(1), ["yield:q:selvedge denim jacket", "last", now], "last sighting always moves");
  assert.deepEqual(commands[3].slice(1), ["yield:q:selvedge denim jacket", "runs", 1]);
  assert.deepEqual(commands[4].slice(1), ["yield:q:selvedge denim jacket", "found", 14]);
  assert.equal(commands[6][2], "selvedge denim jacket", "the index gains the slug");
});

test("scores add as floats; nothing else is written for zero, NaN or infinity", () => {
  const commands = deltaCommands("q", "q", { picked: 1, scoreSum: 84.5, found: Number.NaN, viewed: Infinity, shown: 0 }, "t");
  const incs = commands.filter((c) => String(c[0]).startsWith("HINCRBY"));
  assert.deepEqual(incs, [
    ["HINCRBY", "yield:q:q", "picked", 1],
    ["HINCRBYFLOAT", "yield:q:q", "scoreSum", 84.5],
  ]);
});

test("a hash read back becomes a record, and a missing one becomes nothing", () => {
  const record = fromHash({ query: "wool overshirt grey", runs: "3", found: "41", viewed: "16", picked: "2", scoreSum: "150", first: "a", last: "b" });
  assert.equal(record.runs, 3);
  assert.equal(record.found, 41);
  assert.equal(record.scoreSum, 150);
  assert.equal(record.shown, 0, "fields never incremented read as zero");
  assert.equal(record.first, "a");
  assert.equal(record.last, "b");
  assert.equal(fromHash(null), null);
  assert.equal(fromHash({}), null);
  assert.equal(fromHash({ runs: "1" }), null, "a hash without its query is not a record");
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
