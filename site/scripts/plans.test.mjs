// Plans, limits, and the monthly meter.
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
  // One closet a month is a whole closet — nine pieces, the animation, the
  // taste memory. What's withheld is the service, not the product.
  const free = plans.limitsFor("free");
  assert.equal(free.closets, 1);
  assert.equal(free.judgements, 3);
  assert.equal(free.keeps, 1);
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
  // The free messages name the way out.
  assert.match(plans.limitMessage("closets", "free"), /[Mm]embership/);
});
