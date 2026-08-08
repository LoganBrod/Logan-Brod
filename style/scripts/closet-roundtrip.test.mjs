// Exercises the closet against a stand-in Upstash: create -> read -> update,
// plus TTL renewal and the code-collision path.
//
// lib/redis.ts reads its connection details at module load, so the env has to
// be set before the dynamic import below.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeUpstash } from "./fake-upstash.mjs";

let fake;
let closetLib;

const profile = {
  summary: "Muted, hard-wearing, built around outerwear.",
  aesthetics: ["workwear"],
  palette: [{ name: "olive", hex: "#5A5B41" }],
  silhouette: "Roomy through the shoulder, tapered below.",
  fabrics: ["waxed cotton"],
  formality: "Casual, leaning rugged",
  gaps: ["boots"],
  searchQueries: [
    {
      query: "brown suede chelsea boot",
      category: "footwear",
      minPrice: 80,
      maxPrice: 200,
      reason: "Nothing in the uploads covers footwear.",
    },
  ],
};

const draft = () => ({
  photoUrls: ["https://example.com/a.jpg"],
  range: { min: 50, max: 250 },
  profile,
  items: [],
  outfits: [],
  notes: "Dropped the womenswear and the bulk lots.",
});

before(async () => {
  fake = await startFakeUpstash();
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  closetLib = await import("../lib/closet.ts");
});

after(async () => {
  await fake?.close();
});

test("a created closet reads back intact under its code", async () => {
  const created = await closetLib.createCloset(draft());

  assert.ok(closetLib.isValidCode(created.code), `${created.code} should be a valid code`);

  const read = await closetLib.readCloset(created.code);
  assert.ok(read);
  assert.equal(read.code, created.code);
  assert.equal(read.profile.summary, profile.summary);
  assert.equal(read.notes, "Dropped the womenswear and the bulk lots.");
});

test("reading renews the TTL so an in-use closet doesn't expire", async () => {
  const created = await closetLib.createCloset(draft());
  const entry = fake.store.get(`closet:${created.code}`);

  entry.expiresAt = Date.now() + 5_000; // pretend it is nearly gone
  await closetLib.readCloset(created.code);

  assert.ok(
    fake.store.get(`closet:${created.code}`).expiresAt > Date.now() + 60_000,
    "TTL should be pushed back out on read"
  );
});

test("update preserves code and createdAt, and moves updatedAt", async () => {
  const created = await closetLib.createCloset(draft());
  const updated = await closetLib.updateCloset(created.code, {
    ...draft(),
    notes: "Reran with a wider range.",
  });

  assert.ok(updated);
  assert.equal(updated.code, created.code);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.notes, "Reran with a wider range.");
  assert.ok(updated.updatedAt >= created.createdAt);
});

test("unknown and expired codes read as null rather than throwing", async () => {
  assert.equal(await closetLib.readCloset("ZZZZZZ"), null);

  const created = await closetLib.createCloset(draft());
  fake.store.get(`closet:${created.code}`).expiresAt = Date.now() - 1;
  assert.equal(await closetLib.readCloset(created.code), null);
});

test("updating a code that doesn't exist returns null, not a new closet", async () => {
  assert.equal(await closetLib.updateCloset("ZZZZZZ", draft()), null);
});

test("an occupied code is never overwritten", async () => {
  const created = await closetLib.createCloset(draft());
  const before = fake.store.get(`closet:${created.code}`).value;

  // claimKey is SET NX, so a second claim on a live key must lose.
  const { claimKey } = await import("../lib/redis.ts");
  const won = await claimKey(`closet:${created.code}`, { code: "OTHER" }, 60);

  assert.equal(won, false);
  assert.equal(fake.store.get(`closet:${created.code}`).value, before);
});
