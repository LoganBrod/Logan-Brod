// Does this brand actually serve its catalogue, and is it any good?
//
// Run it from `site/`, on a machine that can reach the open internet:
//
//   npm install
//   npx tsx scripts/shopify-probe.mjs taylorstitch.com buckmason.com 3sixteen.com
//   SHOPIFY_STORES=$(cat stores.txt) npx tsx scripts/shopify-probe.mjs
//
// `npx tsx` rather than `node`, because this shares the real parser with the
// source it is checking - importing a .ts file, which plain node will not do.
// Sharing it is the point: a probe with its own copy of the parsing would
// happily report a catalogue the app then fails to read.
//
// The Shopify source is tested against a local server serving a real-shaped
// payload, which proves the parsing, the matching and the caching. What it
// cannot prove is that a given brand's endpoint exists and answers the way the
// documentation says - that needs a machine which can reach them, and this is
// that check.
//
// For each domain it reports whether the endpoint answered, how many usable
// garments came back, the price range, and three sample titles. Nothing is
// written anywhere; run it as often as you like while picking brands.

import { catalogueUrl, explainCatalogue } from "../lib/sources/shopify.ts";

const domains = (
  process.argv.slice(2).length ? process.argv.slice(2) : (process.env.SHOPIFY_STORES ?? "").split(",")
)
  .map((d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .filter(Boolean);

if (!domains.length) {
  console.error("Give it some domains: npx tsx scripts/shopify-probe.mjs taylorstitch.com buckmason.com");
  process.exit(1);
}

const money = (n) => `$${Math.round(n)}`;

/**
 * Six at a time.
 *
 * Checking forty brands one after another is minutes of waiting, most of it
 * spent on whichever one is slow. They are independent, so they run together -
 * bounded at six because this is somebody's shop being read, not a load test,
 * and a burst of forty simultaneous requests from one address is how a probe
 * turns into something a brand blocks.
 */
const CONCURRENCY = 6;

/** Look at one brand. Returns what to print, so the printing can stay in input order. */
async function probe(domain) {
  const started = Date.now();
  let status = "";
  let garments = [];
  let dropped = null;
  try {
    // The source's own URL builder, so the probe cannot be checking a
    // different address from the one the app will use.
    const res = await fetch(catalogueUrl(domain, 1), {
      headers: {
        "User-Agent": "ClozetBot/1.0 (+https://levozlabs.com; menswear recommendations)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    status = `http ${res.status}`;
    if (res.ok) {
      const payload = await res.json().catch(() => null);
      ({ garments, dropped } = explainCatalogue(payload, domain));
    }
  } catch (err) {
    status = err?.name === "TimeoutError" ? "timed out" : (err?.message ?? "failed").slice(0, 60);
  }
  return { domain, status, garments, dropped, ms: Date.now() - started };
}

const results = new Array(domains.length);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, domains.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= domains.length) return;
      results[index] = await probe(domains[index]);
    }
  })
);

/** Only the domains that actually returned garments; the line at the end is meant to be pasted. */
const usable = [];

// Printed in the order they were asked for, not the order they came back, so
// the output can be compared against the list that was pasted in.
for (const { domain, status, garments, dropped, ms } of results) {
  if (garments.length) {
    usable.push(domain);
    const prices = garments.map((g) => g.price);
    console.log(
      `\n✓ ${domain}  ${status}  ${ms}ms\n  ${garments.length} usable garments, ${money(Math.min(...prices))}–${money(Math.max(...prices))}`
    );
    for (const g of garments.slice(0, 3)) console.log(`    ${money(g.price).padStart(6)}  ${g.title}`);
    if (dropped && dropped.seen > garments.length) {
      const lost = dropped.seen - garments.length;
      console.log(`    (${lost} of ${dropped.seen} dropped: ${dropped.title} not menswear, ${dropped.soldOut} sold out, ${dropped.noImage} no photo)`);
    }
  } else {
    // Distinguishing these matters: a 404 is "not Shopify", a 200 with nothing
    // usable is "Shopify, but everything is sold out, womenswear, or has no
    // photograph", and those want different decisions from you.
    console.log(`\n✗ ${domain}  ${status}  ${ms}ms  — no usable garments`);
    if (dropped?.seen) {
      // Which of the filters ate the catalogue. A brand rejected almost
      // entirely on title is usually womenswear or homeware rather than a
      // brand we cannot read, and that is a decision for you rather than a
      // bug for me.
      const parts = [
        `${dropped.seen} products`,
        dropped.title && `${dropped.title} not menswear`,
        dropped.soldOut && `${dropped.soldOut} sold out`,
        dropped.noImage && `${dropped.noImage} no photo`,
        dropped.malformed && `${dropped.malformed} unreadable`,
      ].filter(Boolean);
      console.log(`    ${parts.join(", ")}`);
    }
  }
}

// The line names only what answered. Printing every domain asked would put a
// dead one into the deployment's config, where it costs a failed request per
// refresh and reads like a brand that has gone missing.
console.log(
  `\n${usable.length} of ${domains.length} domains usable.` +
    (usable.length ? `\n\nSHOPIFY_STORES=${usable.join(",")}` : "")
);
