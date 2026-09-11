// Every route that can spend money has a ceiling on it.
//
//   npm test
//
// This is a structural test rather than a behavioural one, and it exists
// because the bug it catches is invisible in review: `/api/fit` was metered
// and looked protected, but a meter counts against a cookie and the attacker's
// move is to send no cookie. It ran a web search, three page fetches and a
// high-effort model pass, unbounded, from anywhere on the internet.
//
// So rather than trust that the next expensive route remembers, this walks the
// route files and asserts the rule directly: if you can reach a model or a
// marketplace from here, you are counted against the network address.

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API = new URL("../app/api", import.meta.url).pathname;

function routeFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...routeFiles(path));
    else if (entry === "route.ts") out.push(path);
  }
  return out;
}

/** Libraries that reach something we are billed for, directly or through a helper. */
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
 * Routes that reach one of those and are deliberately not address-limited,
 * with the reason. A secret is a stronger gate than a rate limit - you cannot
 * guess your way to the first request - so the two cron-style endpoints are
 * listed here rather than given a bucket they would never hit.
 */
const EXEMPT = new Map([
  ["cron/sweep/route.ts", "requires CRON_SECRET, compared in constant time"],
  ["report/queries/route.ts", "requires ADMIN_SECRET or CRON_SECRET"],
]);

const routes = routeFiles(API);

test("there are routes to check at all", () => {
  // A path change that silently found nothing would make every test below pass.
  assert.ok(routes.length >= 15, `found ${routes.length} route files`);
});

test("every route that can spend money counts against the address", () => {
  const unguarded = [];

  for (const path of routes) {
    const source = readFileSync(path, "utf8");
    const relative = path.slice(API.length + 1);

    const spends = SPENDS.filter((lib) => source.includes(`from "${lib}`));
    if (!spends.length) continue;
    if (EXEMPT.has(relative)) continue;

    if (!source.includes("rateLimit(")) {
      unguarded.push(`${relative} reaches ${spends.join(", ")} with no rateLimit`);
    }
  }

  assert.deepEqual(unguarded, [], unguarded.join("\n"));
});

test("the exemptions are real, and still check a secret", () => {
  for (const [relative] of EXEMPT) {
    const source = readFileSync(join(API, relative), "utf8");
    assert.match(
      source,
      /SECRET/,
      `${relative} is exempt from rate limiting and must be behind a secret`
    );
    // Compared in constant time, not with ===, so the secret can't be guessed
    // a byte at a time off the response latency.
    assert.match(source, /timingSafeEqual|safeEqual|constantTime/i, relative);
  }
});

/**
 * Routes whose caller cannot read a response, so a 429 would be bytes spent on
 * nobody. `sendBeacon` has no way to see a status code and the page has
 * nothing to do about a refused analytics hit anyway — it answers 204 to
 * everything, including the things it drops.
 */
const NO_RESPONSE = new Set(["beacon/route.ts"]);

test("a rate-limited route refuses with 429 and says when to come back", () => {
  // A 429 without Retry-After is a client that retries immediately and a
  // limiter that spends its budget on being hit.
  for (const path of routes) {
    const source = readFileSync(path, "utf8");
    if (!source.includes("rateLimit(")) continue;
    const relative = path.slice(API.length + 1);
    if (NO_RESPONSE.has(relative)) continue;
    assert.match(source, /429/, relative);
    assert.match(source, /Retry-After/, relative);
  }
});

test("the routes that skip the 429 really do answer nothing", () => {
  // Otherwise the exemption above becomes a place to put a route that simply
  // forgot, which is the failure mode of every allowlist.
  for (const relative of NO_RESPONSE) {
    const source = readFileSync(join(API, relative), "utf8");
    assert.match(source, /status: 204/, `${relative} is exempt and must answer 204`);
    assert.doesNotMatch(source, /NextResponse\.json/, `${relative} must not return a body`);
  }
});
