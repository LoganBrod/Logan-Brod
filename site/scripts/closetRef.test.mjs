// Which clozet a follow-up matches against.
//
// The behaviour worth pinning is the one that is easy to get wrong later: a
// code that was given and didn't resolve must NOT quietly fall back to the
// newest clozet. Falling back there answers a different question than the one
// asked - somebody clicks "match accessories" under one wardrobe and gets
// accessories for another - and it would look like it was working.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "lib/closetRef.ts"), "utf8");

test("an explicit code that misses is 'expired', never the newest clozet", () => {
  // The explicit branch has to return before readLibrary is ever reached.
  const explicitBranch = source.slice(
    source.indexOf("if (typeof code === \"string\""),
    source.indexOf("const library")
  );
  assert.match(explicitBranch, /reason: "expired"/);
  assert.ok(
    !explicitBranch.includes("readLibrary"),
    "a given code must not fall through to the newest clozet"
  );
});

test("a miss and an empty library say different things", () => {
  assert.notEqual(
    missMessageFor("expired"),
    missMessageFor("none"),
    "'your link is stale' and 'build your first clozet' are different problems"
  );
  assert.match(missMessageFor("none"), /Build a clozet first/);
  assert.match(missMessageFor("expired"), /expired/);
});

test("both routes resolve through the shared helper", () => {
  for (const route of ["app/api/accessories/route.ts", "app/api/colognes/route.ts"]) {
    const text = readFileSync(join(root, route), "utf8");
    assert.match(text, /resolveCloset\(/, `${route} should use the shared resolver`);
    assert.match(text, /body\.code/, `${route} should accept an explicit clozet code`);
    assert.ok(
      !text.includes("readLibrary("),
      `${route} should not reach for the library itself any more`
    );
  }
});

test("the clozet page only offers a match once there is a code to match against", () => {
  const runner = readFileSync(join(root, "app/components/StyleRunner.tsx"), "utf8");
  // Without a saved clozet there is nothing for the other pages to read, so
  // the offer would be a broken promise.
  assert.match(runner, /\{code && \(\s*<MatchPrompt/);
});

test("both destinations carry the code through to their API", () => {
  for (const file of ["app/components/AccessoryFinder.tsx", "app/components/CologneDesk.tsx"]) {
    const text = readFileSync(join(root, file), "utf8");
    assert.match(text, /params\.get\("from"\)/, `${file} should read the clozet from the link`);
    assert.match(text, /code: from/, `${file} should send it on to the API`);
  }
});

/** Mirrors `missMessage` without importing TypeScript into the test runner. */
function missMessageFor(reason) {
  const body = source.slice(source.indexOf("export function missMessage"));
  const expired = body.match(/"(That clozet has expired[^"]*)"/)[1];
  const none = body.match(/"(Build a clozet first[^"]*)"/)[1];
  return reason === "expired" ? expired : none;
}

test("the cologne recommendation sees the pieces, not just the summary", () => {
  const colognes = readFileSync(join(root, "lib/colognes.ts"), "utf8");
  assert.match(colognes, /whyItFits/, "the per-piece line should reach the prompt");
  assert.match(colognes, /MAX_PIECES/, "the piece list needs a ceiling, not the whole closet");

  const route = readFileSync(join(root, "app/api/colognes/route.ts"), "utf8");
  assert.match(route, /item\.whyItFits/, "the route should pass each piece's line through");
  // Price and image URL tell a fragrance nothing, and an image URL in a text
  // prompt is pure waste.
  assert.ok(
    !/items\.map\(\(item\) => item\)/.test(route),
    "send the two useful fields, not the whole item"
  );
});

test("colognes still recommends rather than searching a marketplace", () => {
  const route = readFileSync(join(root, "app/api/colognes/route.ts"), "utf8");
  // Deliberate: fragrance is among the most counterfeited things sold online
  // and a fake is identical in a photograph. See the note in lib/colognes.ts.
  assert.ok(!route.includes("@/lib/sources"), "this page must not shop the marketplaces");
});
