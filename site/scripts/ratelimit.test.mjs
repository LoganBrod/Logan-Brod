// The gate in front of the endpoints that spend money.
//
// The bug these pin down is that an unidentifiable caller used to be an
// unlimited one, so every assertion about `null` here is load-bearing.

import assert from "node:assert/strict";
import test from "node:test";
import { LIMITS, clientIp } from "../lib/ratelimit.ts";
import { allowance } from "../lib/plans.ts";

const request = (headers) => new Request("https://example.com/", { headers });

test("the address is read from the right-hand end of x-forwarded-for", () => {
  // A caller can send their own header; our edge appends what it actually saw.
  // Reading the left takes the caller's claim, which is the bypass.
  const spoofed = request({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" });
  assert.equal(clientIp(spoofed), "203.0.113.9");
});

test("a single hop is the address", () => {
  assert.equal(clientIp(request({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
});

test("whitespace and empty hops don't produce a blank identity", () => {
  assert.equal(clientIp(request({ "x-forwarded-for": " 1.1.1.1 ,  203.0.113.9 " })), "203.0.113.9");
  assert.equal(clientIp(request({ "x-forwarded-for": "," })), null);
});

test("x-real-ip is the fallback, and no header at all is null", () => {
  assert.equal(clientIp(request({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  assert.equal(clientIp(request({})), null);
});

test("an unidentifiable caller gets nothing, on every meter", async () => {
  // This is the whole bug: usage(null) returned 0, so `used < limit` passed and
  // deleting one cookie restored a full allowance on every meter at once.
  for (const meter of ["closets", "keeps", "judgements", "watches", "wardrobe"]) {
    for (const plan of ["free", "member"]) {
      const room = await allowance(null, plan, meter);
      assert.equal(room.allowed, false, `${plan}/${meter} allowed a null owner`);
    }
  }
});

test("a null owner reports itself as spent, not as untouched", async () => {
  // `used: 0` would read as "plenty left" to anything rendering the number.
  const room = await allowance(null, "free", "closets");
  assert.equal(room.used, room.limit);
});

test("the hourly ceilings bound a run rather than a request", () => {
  // One run is one analyze and up to six curate calls, so curate has to allow
  // several times what analyze does or a legitimate run trips its own limit.
  assert.ok(LIMITS.curate.limit >= LIMITS.analyze.limit * 6);
  for (const [name, cfg] of Object.entries(LIMITS)) {
    assert.equal(cfg.windowSeconds, 3600, `${name} is not an hourly window`);
    assert.ok(cfg.limit > 0, `${name} has no ceiling`);
  }
});
