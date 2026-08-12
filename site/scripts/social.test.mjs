// Publishing a closet, and the one signal anyone can leave on it.
//
//   npm test
//
// The like count is the part worth testing hardest. A count that can be
// inflated by a double-tap, a retried request, or two open tabs is worse than
// no count at all — nobody believes a number they can move by pressing twice.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeUpstash } from "./fake-upstash.mjs";

let stop;

before(async () => {
  const fake = await startFakeUpstash(0);
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test";
  stop = fake.close;
});

after(() => stop?.());

const social = await import("../lib/social.ts");

const owner = (id) => ({ kind: "browser", id });

/** Codes have to pass isValidCode: six chars from the no-lookalikes alphabet. */
const entry = (code, overrides = {}) => ({
  code,
  name: "Waxed workwear",
  by: "logan",
  itemCount: 9,
  range: { min: 50, max: 250 },
  preview: ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"],
  ...overrides,
});

test("a display name is collapsed, trimmed, and bounded", () => {
  assert.equal(social.cleanDisplayName("  Logan   Brod  "), "Logan Brod");
  assert.equal(social.cleanDisplayName("x".repeat(80)).length, 40);
  // Not defaulted here — "Anonymous" is a product decision, not string cleaning.
  assert.equal(social.cleanDisplayName("   "), "");
  assert.equal(social.cleanDisplayName(undefined), "");
  assert.equal(social.cleanDisplayName(42), "");
});

test("publishing rejects a code that isn't a real closet code", async () => {
  assert.equal(await social.publish(entry("nope")), null);
  assert.equal(await social.publish(entry("AAAAA0")), null, "0 isn't in the alphabet");
});

test("a published closet carries at most four thumbnails", async () => {
  const published = await social.publish(entry("AAAAAA"));
  assert.equal(published.preview.length, 4);
  assert.equal(published.likes, 0);
});

test("republishing updates in place and keeps its original position", async () => {
  await social.publish(entry("BBBBBB", { name: "First" }));
  await social.publish(entry("CCCCCC", { name: "Second" }));

  const before = await social.readFeed();
  const positionOfB = before.findIndex((item) => item.code === "BBBBBB");

  const again = await social.publish(entry("BBBBBB", { name: "Renamed" }));
  assert.equal(again.name, "Renamed");

  const after = await social.readFeed();
  assert.equal(
    after.findIndex((item) => item.code === "BBBBBB"),
    positionOfB,
    "republishing must not bump a closet up the feed"
  );
  assert.equal(after.filter((item) => item.code === "BBBBBB").length, 1, "no duplicate entry");
});

test("publishing again preserves the original publish date", async () => {
  const first = await social.publish(entry("DDDDDD"));
  const second = await social.publish(entry("DDDDDD", { name: "Changed" }));
  assert.equal(second.publishedAt, first.publishedAt);
});

test("liking twice counts once", async () => {
  const me = owner("liker0000001");
  await social.publish(entry("EEEEEE"));

  const first = await social.setLike(me, "EEEEEE", true);
  assert.deepEqual(first, { liked: true, likes: 1 });

  const again = await social.setLike(me, "EEEEEE", true);
  assert.deepEqual(again, { liked: true, likes: 1 }, "a repeated like must not inflate the count");
});

test("unliking removes exactly one, and can't go below zero", async () => {
  const me = owner("liker0000002");
  await social.publish(entry("FFFFFF"));

  await social.setLike(me, "FFFFFF", true);
  assert.deepEqual(await social.setLike(me, "FFFFFF", false), { liked: false, likes: 0 });
  // Unliking something never liked is a no-op, not a negative count.
  assert.deepEqual(await social.setLike(me, "FFFFFF", false), { liked: false, likes: 0 });
});

test("two people liking the same closet count separately", async () => {
  await social.publish(entry("GGGGGG"));
  await social.setLike(owner("liker0000003"), "GGGGGG", true);
  const second = await social.setLike(owner("liker0000004"), "GGGGGG", true);
  assert.equal(second.likes, 2);
});

test("the feed's denormalised count follows the real one", async () => {
  await social.publish(entry("HHHHHH"));
  await social.setLike(owner("liker0000005"), "HHHHHH", true);

  const feed = await social.readFeed();
  assert.equal(feed.find((item) => item.code === "HHHHHH").likes, 1);
});

test("unpublishing removes the entry and leaves the rest alone", async () => {
  await social.publish(entry("JJJJJJ"));
  assert.equal(await social.unpublish("JJJJJJ"), true);
  assert.equal(await social.unpublish("JJJJJJ"), false, "already gone");

  const feed = await social.readFeed();
  assert.equal(social.isPublished(feed, "JJJJJJ"), false);
  assert.equal(social.isPublished(feed, "AAAAAA"), true, "other closets survive");
});

test("a like survives the closet leaving and rejoining the feed", async () => {
  const me = owner("liker0000006");
  await social.publish(entry("KKKKKK"));
  await social.setLike(me, "KKKKKK", true);
  await social.unpublish("KKKKKK");

  const republished = await social.publish(entry("KKKKKK"));
  assert.equal(republished.likes, 1, "the count is stored on the closet, not on the feed entry");
  assert.deepEqual(await social.readLiked(me), ["KKKKKK"]);
});

test("decorate sorts newest first and marks your own likes", () => {
  const feed = [
    { code: "AAAAAA", publishedAt: "2026-01-01T00:00:00.000Z", likes: 0 },
    { code: "BBBBBB", publishedAt: "2026-03-01T00:00:00.000Z", likes: 2 },
    { code: "CCCCCC", publishedAt: "2026-02-01T00:00:00.000Z", likes: 1 },
  ];

  const shown = social.decorate(feed, ["BBBBBB"]);
  assert.deepEqual(
    shown.map((item) => item.code),
    ["BBBBBB", "CCCCCC", "AAAAAA"]
  );
  assert.deepEqual(
    shown.map((item) => item.likedByYou),
    [true, false, false]
  );
  // Ordering is by date and never by likes: a discovery page ranked by
  // popularity shows the same six closets forever.
  assert.equal(shown[0].likes, 2);
});

test("decorate does not mutate the feed it was given", () => {
  const feed = [{ code: "AAAAAA", publishedAt: "2026-01-01T00:00:00.000Z", likes: 0 }];
  social.decorate(feed, ["AAAAAA"]);
  assert.equal("likedByYou" in feed[0], false);
});

test("nothing is liked by someone with no identity", async () => {
  assert.deepEqual(await social.readLiked(null), []);
});
