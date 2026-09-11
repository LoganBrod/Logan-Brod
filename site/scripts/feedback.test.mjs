// Bug reports and suggestions.
//
//   npm test
//
// Every field here is typed by a stranger, so the tests are mostly about what
// happens when the stranger is not a person filling in a form: an empty
// message, a novel, a kind that isn't one of the three, a referrer from
// somewhere else.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeUpstash } from "./fake-upstash.mjs";

let stop;
let feedback;

before(async () => {
  const fake = await startFakeUpstash(0);
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test";
  stop = fake.close;
  feedback = await import("../lib/feedback.ts");
});

after(() => stop?.());

test("a report needs words and nothing else", () => {
  const parsed = feedback.parseFeedback({ kind: "bug", message: "  the rail never filled  " });
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.kind, "bug");
  assert.equal(parsed.message, "the rail never filled", "trimmed");
  assert.equal(parsed.contact, undefined, "an address is never required");
  assert.ok(parsed.at, "and it is timestamped here, not by the caller");
});

test("an empty message is the one refusal", () => {
  assert.match(feedback.parseFeedback({ message: "" }).error, /what happened/i);
  assert.match(feedback.parseFeedback({ message: "   " }).error, /what happened/i);
  assert.match(feedback.parseFeedback({}).error, /what happened/i);
  assert.match(feedback.parseFeedback(null).error, /what happened/i);
});

test("a novel is refused rather than truncated", () => {
  // Truncating would store a report whose ending the person did not write,
  // and they would never know which half we kept.
  const long = feedback.parseFeedback({ message: "x".repeat(feedback.MAX_MESSAGE + 1) });
  assert.match(long.error, /characters/);
  assert.equal(feedback.parseFeedback({ message: "x".repeat(feedback.MAX_MESSAGE) }).error, undefined);
});

test("a kind that isn't one of the three is 'other', not a crash", () => {
  assert.equal(feedback.parseFeedback({ kind: "urgent", message: "hi" }).kind, "other");
  assert.equal(feedback.parseFeedback({ kind: 7, message: "hi" }).kind, "other");
  assert.equal(feedback.parseFeedback({ message: "hi" }).kind, "other");
  for (const kind of feedback.KINDS) {
    assert.equal(feedback.parseFeedback({ kind, message: "hi" }).kind, kind);
  }
});

test("the long fields a caller controls are all bounded", () => {
  const parsed = feedback.parseFeedback({
    message: "it broke",
    contact: "a".repeat(500),
    path: "/closet?" + "b".repeat(500),
  });
  assert.ok(parsed.contact.length <= 120, parsed.contact.length);
  assert.ok(parsed.path.length <= 200, parsed.path.length);
});

test("a report goes in and comes back, newest first", async () => {
  await feedback.recordFeedback(feedback.parseFeedback({ kind: "bug", message: "first" }));
  await feedback.recordFeedback(feedback.parseFeedback({ kind: "idea", message: "second" }));

  const items = await feedback.readFeedback(10);
  assert.equal(items[0].message, "second", "newest first - the backlog is read from the top");
  assert.equal(items[1].message, "first");
});

test("the list cannot be used to fill storage", async () => {
  // The cap is on the list rather than per person, because the person is the
  // one thing here that isn't identified.
  for (let i = 0; i < 20; i += 1) {
    await feedback.recordFeedback(feedback.parseFeedback({ message: `report ${i}` }));
  }
  const items = await feedback.readFeedback(1000);
  assert.ok(items.length <= feedback.MAX_STORED, `${items.length} stored`);
});

test("a row that is not a report is skipped, not fatal", async () => {
  const { pipeline } = await import("../lib/redis.ts");
  await pipeline([["LPUSH", "feedback:inbox", "{not json"]]);
  const items = await feedback.readFeedback(10);
  assert.ok(Array.isArray(items));
  assert.ok(items.every((item) => typeof item.message === "string"));
});
