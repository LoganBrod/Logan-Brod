// Standing searches and the seen-set.
//
//   npm test
//
// The seen-set is the whole feature. Get it wrong in one direction and people
// are emailed the same jacket every twelve hours until they unsubscribe; get it
// wrong in the other and the piece they were waiting for is silently swallowed.

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

const watches = await import("../lib/watches.ts");

const owner = (id) => ({ kind: "browser", id });
const range = { min: 50, max: 250 };

test("a watch keeps the queries it was given, bounded", async () => {
  const me = owner("watch00000001");
  const watch = await watches.addWatch(me, {
    name: "  Waxed workwear  ",
    queries: ["waxed cotton jacket", "  ", "moleskin trouser", "suede chelsea boot"],
    range,
  });

  assert.equal(watch.name, "Waxed workwear");
  // The blank is dropped rather than kept as an empty search.
  assert.deepEqual(watch.queries, [
    "waxed cotton jacket",
    "moleskin trouser",
    "suede chelsea boot",
  ]);
  assert.equal(watch.found, 0);
});

test("a nameless watch still has a name", async () => {
  const me = owner("watch00000002");
  const watch = await watches.addWatch(me, { name: "   ", queries: ["boots"], range });
  assert.ok(watch.name.length > 0);
});

test("too many queries is a watch, not a second app", async () => {
  const me = owner("watch00000003");
  const many = Array.from({ length: 20 }, (_, i) => `query ${i}`);
  const watch = await watches.addWatch(me, { name: "Everything", queries: many, range });
  assert.equal(watch.queries.length, watches.MAX_QUERIES_PER_WATCH);
});

test("pausing stops it without losing it", async () => {
  const me = owner("watch00000004");
  const watch = await watches.addWatch(me, { name: "Pausable", queries: ["boots"], range });

  const paused = await watches.updateWatch(me, watch.id, { paused: true });
  assert.equal(paused?.paused, true);
  assert.equal((await watches.readWatches(me)).length, 1, "pausing must not delete it");

  const resumed = await watches.updateWatch(me, watch.id, { paused: false });
  assert.equal(resumed?.paused, false);
});

test("a watch isn't someone else's to touch", async () => {
  const me = owner("watch00000005");
  const stranger = owner("watch00000006");
  const watch = await watches.addWatch(me, { name: "Mine", queries: ["boots"], range });

  assert.equal(await watches.updateWatch(stranger, watch.id, { paused: true }), null);
  assert.equal(await watches.removeWatch(stranger, watch.id), false);
  assert.equal((await watches.readWatches(me)).length, 1);
});

test("what a sweep reported is not reported again", async () => {
  const me = owner("watch00000007");
  const watch = await watches.addWatch(me, { name: "Seen", queries: ["boots"], range });

  await watches.markSeen(me, watch.id, ["jacket|180", "boot|120"]);
  const seen = await watches.readSeen(me, watch.id);
  assert.ok(seen.includes("jacket|180"));
  assert.ok(seen.includes("boot|120"));
});

test("two watches don't share a memory", async () => {
  const me = owner("watch00000008");
  const a = await watches.addWatch(me, { name: "A", queries: ["a"], range });
  const b = await watches.addWatch(me, { name: "B", queries: ["b"], range });

  await watches.markSeen(me, a.id, ["only-in-a"]);
  assert.deepEqual(await watches.readSeen(me, b.id), []);
});

test("the seen-set is bounded, keeping the most recent", async () => {
  const me = owner("watch00000009");
  const watch = await watches.addWatch(me, { name: "Long", queries: ["x"], range });

  await watches.markSeen(me, watch.id, Array.from({ length: 500 }, (_, i) => `old-${i}`));
  await watches.markSeen(me, watch.id, ["brand-new"]);

  const seen = await watches.readSeen(me, watch.id);
  assert.ok(seen.length <= 400, `${seen.length} entries kept`);
  assert.ok(seen.includes("brand-new"), "the newest must survive the trim");
});

test("the roster knows who to sweep, and forgets them when the last watch goes", async () => {
  const me = owner("watch00000010");
  const watch = await watches.addWatch(me, { name: "Only one", queries: ["x"], range });

  const rostered = await watches.listWatchers();
  assert.ok(rostered.some((entry) => entry.id === "watch00000010"));

  await watches.removeWatch(me, watch.id);
  const after = await watches.listWatchers();
  assert.ok(!after.some((entry) => entry.id === "watch00000010"), "should be off the roster");
});

test("someone with two watches stays on the roster after removing one", async () => {
  const me = owner("watch00000011");
  const a = await watches.addWatch(me, { name: "A", queries: ["a"], range });
  await watches.addWatch(me, { name: "B", queries: ["b"], range });

  await watches.removeWatch(me, a.id);
  const roster = await watches.listWatchers();
  assert.ok(roster.some((entry) => entry.id === "watch00000011"));
});

test("the roster doesn't list anyone twice", async () => {
  const me = owner("watch00000012");
  await watches.addWatch(me, { name: "A", queries: ["a"], range });
  await watches.addWatch(me, { name: "B", queries: ["b"], range });

  const roster = await watches.listWatchers();
  assert.equal(roster.filter((entry) => entry.id === "watch00000012").length, 1);
});

test("a finished run becomes a watch without anyone writing a query", () => {
  const built = watches.watchFromQueries(
    ["waxed cotton jacket", "moleskin trouser", "suede boot", "shetland crewneck", "oxford shirt",
     "wool overcoat", "leather belt", "flannel trouser"],
    range,
    "Workwear"
  );
  assert.equal(built.queries.length, watches.MAX_QUERIES_PER_WATCH);
  // Ordered by how central they are to the style, so the first few are right.
  assert.equal(built.queries[0], "waxed cotton jacket");
});
