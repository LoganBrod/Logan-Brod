// Accounts, sign-in links, and the closet library.
//
//   npm test
//
// Runs against the in-memory Upstash stand-in, so it's offline like everything
// else here. The things worth pinning are the ones that are quietly dangerous
// to get wrong: a sign-in link that can be used twice, a keep that pins someone
// else's closet, and a merge that loses the work someone did before signing up.

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

// Imported after the env vars are set — the client reads them at module load.
const accounts = await import("../lib/accounts.ts");
const library = await import("../lib/library.ts");
const { tasteIdFor } = await import("../lib/viewer.ts");

const ORIGIN = "https://example.com";

test("an address that can't be delivered to is refused", () => {
  for (const bad of ["", "logan", "logan@", "@example.com", "a b@example.com", "no-dot@example"]) {
    assert.equal(accounts.looksLikeEmail(bad), false, bad);
  }
  for (const good of ["logan@example.com", "L.O+tag@Example.CO.UK"]) {
    assert.equal(accounts.looksLikeEmail(good), true, good);
  }
});

test("the same address is the same account however it's typed", async () => {
  const a = await accounts.upsertUser("Logan@Example.com");
  const b = await accounts.upsertUser("  logan@example.com  ");
  assert.equal(a.id, b.id);
  assert.equal(a.email, "logan@example.com");
});

test("a sign-in link works exactly once", async () => {
  const link = await accounts.createLoginLink("once@example.com", ORIGIN);
  assert.ok(!("rateLimited" in link));

  const first = await accounts.consumeLoginLink(link.token);
  assert.equal(first?.user.email, "once@example.com");

  // The second attempt is what a leaked or forwarded link looks like.
  const second = await accounts.consumeLoginLink(link.token);
  assert.equal(second, null);
});

test("a token nobody minted is refused without a lookup", async () => {
  assert.equal(await accounts.consumeLoginLink("short"), null);
  assert.equal(await accounts.consumeLoginLink("../../etc/passwd"), null);
  assert.equal(await accounts.consumeLoginLink("A".repeat(40)), null);
});

test("the link carries the browser that asked, so its work can be adopted", async () => {
  const link = await accounts.createLoginLink("carry@example.com", ORIGIN, "browser0001");
  const used = await accounts.consumeLoginLink(link.token);
  assert.equal(used?.tasteId, "browser0001");
});

test("one address can't be mailbombed through the form", async () => {
  // Anyone can type someone else's address in; the person who pays for that is
  // the one who didn't.
  let limited = false;
  for (let i = 0; i < 8; i += 1) {
    const result = await accounts.createLoginLink("flood@example.com", ORIGIN);
    if ("rateLimited" in result) limited = true;
  }
  assert.ok(limited, "no limit was ever hit");
});

test("a session resolves to its user and stops after signing out", async () => {
  const user = await accounts.upsertUser("session@example.com");
  const sid = await accounts.startSession(user.id);
  const cookie = `sid=${sid}`;

  assert.equal((await accounts.readSession(cookie))?.id, user.id);
  await accounts.endSession(cookie);
  assert.equal(await accounts.readSession(cookie), null);
});

test("a made-up session cookie is not a session", async () => {
  assert.equal(await accounts.readSession("sid=nope"), null);
  assert.equal(await accounts.readSession(null), null);
  assert.equal(await accounts.readSession("sid=" + "A".repeat(43)), null);
});

test("an account's taste id can't collide with a browser's", () => {
  const user = tasteIdFor({ kind: "user", id: "abc123def456" });
  const browser = tasteIdFor({ kind: "browser", id: "abc123def456" });
  assert.notEqual(user, browser);
  // Both still have to be storable.
  assert.ok(accounts.looksLikeEmail("x@y.zz"));
});

// ------------------------------------------------------------------ library

const entry = (code, over = {}) => ({
  code,
  createdAt: "2026-08-01T00:00:00.000Z",
  itemCount: 8,
  range: { min: 50, max: 250 },
  ...over,
});

const owner = (id) => ({ kind: "browser", id });

test("a closet you build appears in your list, newest first", async () => {
  const me = owner("libtest00001");
  await library.addToLibrary(me, entry("AAAAAA", { createdAt: "2026-08-01T00:00:00.000Z" }));
  await library.addToLibrary(me, entry("BBBBBB", { createdAt: "2026-08-02T00:00:00.000Z" }));

  const list = await library.readLibrary(me);
  assert.deepEqual(
    list.map((e) => e.code),
    ["BBBBBB", "AAAAAA"]
  );
});

test("keeping a closet names it and records when", async () => {
  const me = owner("libtest00002");
  await library.addToLibrary(me, entry("CCCCCC"));

  const kept = await library.keepCloset(me, "CCCCCC", "  Waxed workwear  ");
  assert.equal(kept?.name, "Waxed workwear");
  assert.ok(kept?.keptAt);

  const released = await library.releaseCloset(me, "CCCCCC");
  assert.equal(released?.keptAt, undefined);
});

test("keeping a closet is what makes it permanent", async () => {
  // The whole distinction the page draws: a run expires, a kept closet doesn't.
  const { setJson } = await import("../lib/redis.ts");
  const me = owner("libtest00007");
  await setJson("closet:GGGGGG", { code: "GGGGGG" }, 60);
  await library.addToLibrary(me, entry("GGGGGG"));

  const ttl = async () => {
    const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify(["TTL", "closet:GGGGGG"]),
    });
    return (await res.json()).result;
  };

  assert.ok((await ttl()) > 0, "should start with an expiry");
  await library.keepCloset(me, "GGGGGG", "Permanent");
  assert.equal(await ttl(), -1, "keeping should have removed the expiry");

  await library.releaseCloset(me, "GGGGGG");
  assert.ok((await ttl()) > 0, "letting it go should restore the expiry");
});

test("knowing a code doesn't let you keep someone else's closet", async () => {
  const me = owner("libtest00003");
  const stranger = owner("libtest00004");
  await library.addToLibrary(me, entry("DDDDDD"));

  assert.equal(await library.keepCloset(stranger, "DDDDDD", "mine now"), null);
  assert.equal(await library.forgetCloset(stranger, "DDDDDD"), false);
  // And the real owner still has it.
  assert.equal((await library.readLibrary(me)).length, 1);
});

test("removing a closet takes it off your list and leaves the closet alone", async () => {
  const me = owner("libtest00005");
  await library.addToLibrary(me, entry("EEEEEE"));
  assert.equal(await library.forgetCloset(me, "EEEEEE"), true);
  assert.deepEqual(await library.readLibrary(me), []);
});

test("saving the same closet twice doesn't list it twice", async () => {
  const me = owner("libtest00006");
  await library.addToLibrary(me, entry("FFFFFF"));
  await library.addToLibrary(me, entry("FFFFFF", { itemCount: 9 }));

  const list = await library.readLibrary(me);
  assert.equal(list.length, 1);
  assert.equal(list[0].itemCount, 9);
});

test("signing in adopts what the browser built, without duplicating", () => {
  const account = [entry("SHARED", { createdAt: "2026-08-05T00:00:00.000Z" })];
  const browser = [
    entry("SHARED", { createdAt: "2026-08-05T00:00:00.000Z" }),
    entry("ANON01", { createdAt: "2026-08-06T00:00:00.000Z" }),
  ];

  const merged = library.mergeLibraries(account, browser);
  assert.deepEqual(
    merged.map((e) => e.code),
    ["ANON01", "SHARED"]
  );
});

test("a browser with nothing to adopt changes nothing", () => {
  const account = [entry("KEEPME")];
  assert.deepEqual(library.mergeLibraries(account, []), account);
});
