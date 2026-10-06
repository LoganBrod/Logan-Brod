// The pause switch actually covers everything that spends.
//
//   npm test
//
// PAUSED=1 is an emergency brake, and a brake with one wheel missing is worse
// than no brake, because you believe it. So this asserts the rule structurally
// rather than trusting the next expensive route to remember: if a route file
// imports something we are billed for, it either checks generationsPaused() or
// it is on a list here with a written reason.

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API = new URL("../app/api", import.meta.url).pathname;
const LIB = new URL("../lib", import.meta.url).pathname;

function routeFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...routeFiles(path));
    else if (entry === "route.ts") out.push(path);
  }
  return out;
}

/** Same list the spend guard uses: anything that reaches something we pay for. */
const SPENDS = [
  "@/lib/analyze",
  "@/lib/curate",
  "@/lib/judge",
  "@/lib/fit",
  "@/lib/requery",
  "@/lib/accessories",
  "@/lib/colognes",
  "@/lib/wardrobeOwned",
  "@/lib/sources",
  "@/lib/thumbnails",
];

/**
 * Routes that reach a SPENDS library and are deliberately left running while
 * paused, with the reason.
 *
 * Both are here because pausing them would break reading back something a
 * person already has, which costs nothing and is the only thing they still want
 * from a paused site.
 */
const STAYS_UP = new Map([
  ["image/route.ts", "fetches pictures so a saved closet still renders; no model call"],
]);

const routes = routeFiles(API);

test("there are routes to check at all", () => {
  assert.ok(routes.length > 5, `expected to find route files under ${API}`);
});

test("every route that can spend is behind the pause", () => {
  const missing = [];
  for (const file of routes) {
    const src = readFileSync(file, "utf8");
    if (!SPENDS.some((lib) => src.includes(`from "${lib}`))) continue;

    const rel = file.slice(API.length + 1);
    if (STAYS_UP.has(rel)) continue;
    if (!src.includes("generationsPaused(")) missing.push(rel);
  }
  assert.deepEqual(
    missing,
    [],
    `these routes can spend money and ignore PAUSED=1:\n  ${missing.join("\n  ")}`
  );
});

test("the sweep answers 200 when paused, not 503", () => {
  // .github/workflows/sweep.yml exits 1 on anything but a 200, so a 503 here
  // would turn the twice-daily schedule red for as long as the pause lasts.
  const src = readFileSync(join(API, "cron/sweep/route.ts"), "utf8");
  assert.ok(src.includes("generationsPaused("), "the sweep does not check the pause");
  assert.ok(
    !src.includes("pausedResponse("),
    "the sweep uses pausedResponse(), which is a 503 and will fail the GitHub Action"
  );
  assert.ok(src.includes("paused: true"), "the sweep should say so in its body");
});

test("the paused sentence stays out of next/server, so the client can read it", () => {
  // StyleRunner is a client component and renders this message. Importing it
  // from lib/paused.ts would drag `next/server` into the browser bundle and
  // break the build - which is exactly what happened once.
  const copy = readFileSync(join(LIB, "copy.ts"), "utf8");
  assert.ok(copy.includes("PAUSED_MESSAGE"), "PAUSED_MESSAGE should live in lib/copy.ts");
  // The import statement, not the words. The file explains in a comment *why*
  // the sentence lives here rather than next to the response helper, and a bare
  // substring check failed on its own explanation.
  assert.ok(
    !/\bfrom\s+["']next\/server["']/.test(copy),
    "lib/copy.ts must not import next/server - client components import it"
  );

  const runner = readFileSync(
    new URL("../app/components/StyleRunner.tsx", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    runner.includes('import { PAUSED_MESSAGE } from "@/lib/copy"'),
    "StyleRunner should take the message from lib/copy, not lib/paused"
  );
});
