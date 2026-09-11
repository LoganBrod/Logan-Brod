// Plans, limits, and the weekly meter.
//
//   npm test
//
// The thing worth pinning is that metering never becomes a way to lose work:
// a limit is checked before the expensive part and only counted after it
// succeeded, and a storage failure must let the action through rather than
// block it.

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

const plans = await import("../lib/plans.ts");

test("free gets a real closet, not a crippled one", () => {
  // Three closets a week is enough to watch it change its mind about you.
  // What's withheld is the service, not the product.
  const free = plans.limitsFor("free");
  assert.equal(free.closets, 3);
  assert.equal(free.judgements, 3);
  assert.equal(free.keeps, 2);
});

test("membership lifts the counted things and bounds the running ones", () => {
  const member = plans.limitsFor("member");
  assert.ok(plans.isUnlimited(member.closets));
  assert.ok(plans.isUnlimited(member.judgements));
  // Watches and wardrobe cost money every day, so they're generous, not infinite.
  assert.ok(member.watches > 0 && !plans.isUnlimited(member.watches));
  assert.ok(member.wardrobe > 0 && !plans.isUnlimited(member.wardrobe));
});

test("an unknown plan is treated as free", () => {
  assert.deepEqual(plans.limitsFor("enterprise"), plans.limitsFor("free"));
});

test("anonymous is free, and the account's plan wins", () => {
  assert.equal(plans.planFor(null), "free");
  assert.equal(plans.planFor({ id: "u", email: "a@b.cc", createdAt: "" }), "free");
  assert.equal(
    plans.planFor({ id: "u", email: "a@b.cc", createdAt: "", plan: "member" }),
    "member"
  );
});

test("membership can be granted by env var while there's no payment provider", () => {
  process.env.MEMBER_EMAILS = " Logan@Example.com ,other@example.com";
  assert.equal(plans.planFor({ id: "u", email: "logan@example.com", createdAt: "" }), "member");
  assert.equal(plans.planFor({ id: "u", email: "nobody@example.com", createdAt: "" }), "free");
  delete process.env.MEMBER_EMAILS;
});

test("the meter counts, and the allowance sees it", async () => {
  const me = "metertest0001";
  assert.deepEqual(await plans.allowance(me, "free", "judgements"), {
    allowed: true,
    used: 0,
    limit: 3,
    plan: "free",
    resets: plans.resetsAt("judgements"),
  });

  await plans.spend(me, "judgements");
  await plans.spend(me, "judgements");
  assert.equal((await plans.allowance(me, "free", "judgements")).used, 2);
  assert.equal((await plans.allowance(me, "free", "judgements")).allowed, true);

  await plans.spend(me, "judgements");
  assert.equal((await plans.allowance(me, "free", "judgements")).allowed, false);
});

test("meters don't leak into each other", async () => {
  const me = "metertest0002";
  await plans.spend(me, "closets");
  assert.equal((await plans.usage(me, "closets")), 1);
  assert.equal((await plans.usage(me, "judgements")), 0);
});

test("two people don't share a meter", async () => {
  await plans.spend("metertest0003", "closets");
  assert.equal(await plans.usage("metertest0004", "closets"), 0);
});

test("a member isn't stopped by a meter that's been running for months", async () => {
  const me = "metertest0005";
  for (let i = 0; i < 50; i += 1) await plans.spend(me, "closets");
  assert.equal((await plans.allowance(me, "member", "closets")).allowed, true);
});

test("nothing to meter against is a refusal", async () => {
  // This test asserted the opposite until the audit found what it was
  // protecting. The original worry was real — an anonymous first-time visitor
  // has no id, and that must not read as "you're out of closets" — but waving
  // through everything unmeasurable is not the way to fix it: `usage(null)`
  // returns 0, so the allowance always passed, and deleting one cookie restored
  // a full allowance on every meter at once. On routes that spend $0.28-0.59 a
  // call, that was the whole quota system defeated by a browser setting.
  //
  // The first-time visitor is now served a step earlier: routes call
  // `identify`, which mints a browser id before anything is metered. So a null
  // arriving here no longer means "new person", it means "we could not work out
  // who this is" — and that gets nothing.
  assert.equal(await plans.usage(null, "closets"), 0);
  assert.equal((await plans.allowance(null, "free", "closets")).allowed, false);
  // Still never throws: a lost count must not be able to fail a request.
  await plans.spend(null, "closets");
});

test("a limit says what to do about it, not just no", () => {
  for (const meter of ["closets", "keeps", "judgements", "watches", "wardrobe"]) {
    const free = plans.limitMessage(meter, "free");
    assert.ok(free.length > 20, meter);
    assert.ok(plans.limitMessage(meter, "member").length > 20, meter);
  }
  // The free messages name the way out, and the two weekly ones say when.
  assert.match(plans.limitMessage("closets", "free"), /[Mm]embership/);
  assert.match(plans.limitMessage("closets", "free"), /Monday/);
  assert.match(plans.limitMessage("judgements", "free"), /Monday/);
});

test("the window is the week, and it turns over on Monday", () => {
  // Friday 2026-09-11: the Monday that started this week is the 7th, and the
  // counter goes back to zero on the 14th.
  const friday = Date.UTC(2026, 8, 11, 17, 30);
  assert.equal(plans.resetsAt("closets", friday), "2026-09-14T00:00:00.000Z");

  // The boundary itself belongs to the week it opens, not the one it closes.
  const monday = Date.UTC(2026, 8, 14, 0, 0, 0);
  assert.equal(plans.resetsAt("closets", monday), "2026-09-21T00:00:00.000Z");
  assert.equal(plans.resetsAt("closets", monday - 1), "2026-09-14T00:00:00.000Z");

  // A Sunday is the end of its week, not the start of the next one - the
  // off-by-one that a week anchored to Sunday would produce here.
  const sunday = Date.UTC(2026, 8, 13, 23, 0);
  assert.equal(plans.resetsAt("closets", sunday), "2026-09-14T00:00:00.000Z");
});

test("a week's spending does not carry into the next week", async () => {
  const me = "metertest0006";
  for (let i = 0; i < 3; i += 1) await plans.spend(me, "closets");
  assert.equal((await plans.allowance(me, "free", "closets")).allowed, false, "three is the week's lot");

  // The next week is a different key, so the same person starts clean. Proven
  // by asking for a period that cannot be this one rather than by waiting.
  assert.notEqual(plans.resetsAt("closets"), plans.resetsAt("closets", Date.now() + 8 * 24 * 60 * 60 * 1000));
});

test("an allowance says when it comes back, so a refusal can name a day", async () => {
  const room = await plans.allowance("metertest0007", "free", "closets");
  assert.match(room.resets, /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  assert.ok(new Date(room.resets).getTime() > Date.now(), "always in the future");
  assert.equal(new Date(room.resets).getUTCDay(), 1, "and it is a Monday");
});

test("even the refusal with nothing to meter against says when", async () => {
  const room = await plans.allowance(null, "free", "closets");
  assert.equal(room.allowed, false);
  assert.ok(room.resets, "a 402 with no reset time is a dead end");
});
