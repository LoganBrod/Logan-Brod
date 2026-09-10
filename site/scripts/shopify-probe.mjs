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

import { parseCatalogue } from "../lib/sources/shopify.ts";

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
let usable = 0;

for (const domain of domains) {
  const started = Date.now();
  let status = "";
  let garments = [];
  try {
    const res = await fetch(`https://${domain}/products.json?limit=250`, {
      headers: {
        "User-Agent": "ClozetBot/1.0 (+https://levozlabs.com; menswear recommendations)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    status = `http ${res.status}`;
    if (res.ok) {
      const payload = await res.json().catch(() => null);
      garments = parseCatalogue(payload, domain);
    }
  } catch (err) {
    status = err?.name === "TimeoutError" ? "timed out" : (err?.message ?? "failed").slice(0, 60);
  }

  const ms = Date.now() - started;
  if (garments.length) {
    usable += 1;
    const prices = garments.map((g) => g.price);
    console.log(
      `\n✓ ${domain}  ${status}  ${ms}ms\n  ${garments.length} usable garments, ${money(Math.min(...prices))}–${money(Math.max(...prices))}`
    );
    for (const g of garments.slice(0, 3)) console.log(`    ${money(g.price).padStart(6)}  ${g.title}`);
  } else {
    // Distinguishing these matters: a 404 is "not Shopify", a 200 with nothing
    // usable is "Shopify, but everything is sold out, womenswear, or has no
    // photograph", and those want different decisions from you.
    console.log(`\n✗ ${domain}  ${status}  ${ms}ms  — no usable garments`);
  }
}

console.log(
  `\n${usable} of ${domains.length} domains usable.` +
    (usable ? `\n\nSHOPIFY_STORES=${domains.join(",")}` : "")
);
