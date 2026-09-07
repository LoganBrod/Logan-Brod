// The per-query records under the concurrency that broke their first version.
//
//   npm test
//
// Fifty runs recording ten queries each, all at once, and six curation batches
// landing on the same query at the same moment. The first implementation kept
// one JSON blob per query and one for the index and rewrote them on every
// update; under this load it lost forty-seven of fifty-one queries from the
// index. Every count below is exact because every write is now an increment.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeUpstash } from "./fake-upstash.mjs";

let fake;
let yieldLib;

before(async () => {
  fake = await startFakeUpstash();
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  yieldLib = await import("../lib/yield.ts");
});

after(async () => {
  await fake.close();
});

test("fifty concurrent runs of ten queries each all reach the index, with exact counts", async () => {
  const { recordFound, readYieldReport } = yieldLib;
  const queries = Array.from({ length: 10 }, (_, i) => `query number ${i}`);
  await Promise.all(
    Array.from({ length: 50 }, () => recordFound(queries.map((query) => ({ query, found: 3 }))))
  );
  const report = await readYieldReport();
  assert.equal(report.queries.length, 10);
  for (const row of report.queries) {
    assert.equal(row.runs, 50, `${row.query} counted every run`);
    assert.equal(row.found, 150);
  }
});

test("six batches judging the same query at once lose nothing, and scores add", async () => {
  const { recordJudged, readYieldReport } = yieldLib;
  const viewed = Array.from({ length: 16 }, () => ({ matchedQuery: "the same query" }));
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      recordJudged(viewed, [{ matchedQuery: "the same query", score: 70 + i }])
    )
  );
  const row = (await readYieldReport()).queries.find((q) => q.query === "the same query");
  assert.equal(row.viewed, 96);
  assert.equal(row.picked, 6);
  assert.equal(row.scoreSum, 70 + 71 + 72 + 73 + 74 + 75);
  assert.equal(row.meanScore, 72.5);
});

test("run summaries saved at once are all kept, newest first, capped", async () => {
  const { recordRun, readYieldReport } = yieldLib;
  await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      recordRun({ runId: `run_${String(i).padStart(4, "0")}`, at: `t${i}`, picks: i, requeried: false, addedByRequery: 0, queries: [] })
    )
  );
  const { runs } = await readYieldReport();
  assert.equal(runs.length, 40);
  assert.equal(new Set(runs.map((r) => r.runId)).size, 40, "no summary overwrote another");
});

test("a person's signals credit the query that found the piece", async () => {
  const { recordSignal, readYieldReport } = yieldLib;
  await Promise.all([
    recordSignal("Waxed cotton field jacket, olive", "shown"),
    recordSignal("waxed cotton field jacket olive", "shown"),
    recordSignal("waxed cotton field jacket olive", "yes"),
    recordSignal(undefined, "yes"),
  ]);
  const row = (await readYieldReport()).queries.find((q) => q.query.toLowerCase().startsWith("waxed cotton"));
  assert.equal(row.shown, 2, "two spellings, one record");
  assert.equal(row.yes, 1);
});
