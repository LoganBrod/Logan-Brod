// Traffic, and the reason it cannot be used to fill a database.
//
//   npm test
//
// The normalisers are the load-bearing part and so they get most of the tests.
// Every one of path, referrer and campaign arrives from a browser and becomes
// a Redis field name, and a field name taken from a request is a hash somebody
// can grow to any size they like. "Unrecognised collapses to one row" is a
// storage guarantee here, not a display preference.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeUpstash } from "./fake-upstash.mjs";

let stop;
let an;

before(async () => {
  const fake = await startFakeUpstash(0);
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test";
  stop = fake.close;
  an = await import("../lib/analytics.ts");
});

after(() => stop?.());

test("a known route keeps its name and everything else is one row", () => {
  assert.equal(an.normalisePath("/closet"), "/closet");
  assert.equal(an.normalisePath("/closet/tools"), "/closet/tools");
  assert.equal(an.normalisePath("/"), "/");
  assert.equal(an.normalisePath("/closet/"), "/closet", "a trailing slash is the same page");
  assert.equal(an.normalisePath("/closet?signin=1"), "/closet", "the query is not the page");
  assert.equal(an.normalisePath("/closet#top"), "/closet");
});

test("a closet code is collapsed, because six random characters is unbounded", () => {
  assert.equal(an.normalisePath("/closet/AB12CD"), "/closet/:code");
  assert.equal(an.normalisePath("/closet/ZZZZZZ"), "/closet/:code");
});

test("a path nobody has heard of cannot become a key", () => {
  // The whole attack is a loop posting /aaaa1, /aaaa2, ... until the hash is
  // a gigabyte. Every one of them has to land in the same row.
  const invented = ["/x", "/../etc/passwd", "/" + "a".repeat(500), "", null, 7, {}];
  for (const path of invented) assert.equal(an.normalisePath(path), "/other", String(path).slice(0, 20));
});

test("referrers are named where it matters and pooled where it doesn't", () => {
  assert.equal(an.normaliseSource("https://www.tiktok.com/@someone/video/123"), "tiktok");
  assert.equal(an.normaliseSource("https://vm.tiktok.com/abc"), "tiktok");
  assert.equal(an.normaliseSource("https://instagram.com/p/x"), "instagram");
  assert.equal(an.normaliseSource("https://youtu.be/x"), "youtube");
  assert.equal(an.normaliseSource("https://www.google.co.uk/search?q=a"), "google");
  assert.equal(an.normaliseSource("https://duckduckgo.com/?q=a"), "search");
  assert.equal(an.normaliseSource("https://t.co/abc"), "x");
});

test("no referrer is direct, and our own pages are not an arrival", () => {
  assert.equal(an.normaliseSource(""), "direct");
  assert.equal(an.normaliseSource(null), "direct");
  assert.equal(an.normaliseSource(undefined), "direct");
  // Without this, clicking from the home page to /closet counts as somebody
  // new arriving from levozlabs.com, and every funnel number is inflated.
  assert.equal(an.normaliseSource("https://www.levozlabs.com/closet", "levozlabs.com"), "internal");
  assert.equal(an.normaliseSource("https://levozlabs.com/", "www.levozlabs.com"), "internal");
});

test("an unknown or unparseable referrer is one row, not a new one each time", () => {
  assert.equal(an.normaliseSource("https://someblog.example/post"), "other");
  assert.equal(an.normaliseSource("not a url at all"), "other");
  assert.equal(an.normaliseSource("android-app://com.example"), "other");
});

test("a campaign tag is short, lowercase and refused when it isn't", () => {
  assert.equal(an.normaliseCampaign("blue-jacket"), "blue-jacket");
  assert.equal(an.normaliseCampaign("  TikTok1  "), "tiktok1");
  assert.equal(an.normaliseCampaign("a".repeat(24)), "a".repeat(24));
  assert.equal(an.normaliseCampaign("a".repeat(25)), null, "past the ceiling is refused");
  assert.equal(an.normaliseCampaign("-leading"), null);
  assert.equal(an.normaliseCampaign("has space"), null);
  assert.equal(an.normaliseCampaign("semi;colon"), null, "a separator must never survive");
  assert.equal(an.normaliseCampaign(""), null);
  assert.equal(an.normaliseCampaign(42), null);
});

test("a pageview is counted, and reads back", async () => {
  await an.recordHit({ path: "/closet", source: "tiktok", visitor: "visitor-one", returning: false });
  const report = await an.readTraffic(1);

  assert.equal(report.totals.views, 1);
  assert.equal(report.totals.paths["/closet"], 1);
  assert.equal(report.totals.sources.tiktok, 1);
  assert.equal(report.totals.new, 1);
  assert.equal(report.days.length, 1);
  assert.equal(report.days[0].day, an.dayKey());
});

test("events land where the funnel reads them", async () => {
  await an.recordHit({ event: "run_start" });
  await an.recordHit({ event: "run_done" });
  await an.recordHit({ event: "run_done" });
  const report = await an.readTraffic(1);
  assert.equal(report.totals.events.run_start, 1);
  assert.equal(report.totals.events.run_done, 2);
});

test("an event that isn't one of ours is dropped rather than stored", async () => {
  const before = (await an.readTraffic(1)).totals;
  await an.recordHit({ event: "drop_table" });
  const after = (await an.readTraffic(1)).totals;
  assert.equal(after.events.drop_table, undefined, "an invented event name is never a field");
  assert.equal(Object.keys(after.events).length, Object.keys(before.events).length);
});

test("a hit with nothing in it writes nothing", async () => {
  const before = (await an.readTraffic(1)).totals.views;
  await an.recordHit({});
  await an.recordHit({ visitor: "someone" });
  assert.equal((await an.readTraffic(1)).totals.views, before, "no path and no event is not a hit");
});

test("distinct browsers are counted without being stored", async () => {
  for (let i = 0; i < 25; i += 1) {
    await an.recordHit({ path: "/", visitor: `person-${i}`, returning: false });
  }
  // Same person twice is still one.
  await an.recordHit({ path: "/", visitor: "person-0", returning: true });

  const report = await an.readTraffic(1);
  // Approximate by design - a HyperLogLog trades exactness for a fixed size.
  assert.ok(report.totals.visitors >= 20, `${report.totals.visitors} counted`);
  assert.ok(report.totals.visitors <= 32, `${report.totals.visitors} counted`);
});

test("the span is clamped, so a request cannot ask for a thousand days", async () => {
  assert.equal((await an.readTraffic(1000)).days.length, 90);
  assert.equal((await an.readTraffic(0)).days.length, 1);
  assert.equal((await an.readTraffic(-5)).days.length, 1);
});

test("days with nothing in them are still days, not gaps", async () => {
  const report = await an.readTraffic(7);
  assert.equal(report.days.length, 7);
  // A chart with missing days lies about the shape of a launch.
  const ordered = report.days.map((d) => d.day);
  assert.deepEqual([...ordered].sort(), ordered, "oldest first");
  assert.equal(ordered[ordered.length - 1], an.dayKey(), "today is last");
});
