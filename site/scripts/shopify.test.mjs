// Reading a brand's own catalogue.
//
//   npm test
//
// The whole source is exercised against a local server serving a real-shaped
// Shopify payload, because this environment cannot reach a live store. What
// that proves is the parsing, the matching, the caching and the failure
// behaviour; what it cannot prove is that a given brand's endpoint answers the
// way the documentation says. `scripts/shopify-probe.mjs` is the other half,
// and it is run from a machine that can reach them.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createServer } from "node:http";
import { startFakeUpstash } from "./fake-upstash.mjs";

let fake;
let store;
let origin;
let shopify;
let requests = 0;

/** The shape Shopify actually serves, including the parts we ignore. */
const product = (over = {}) => ({
  id: over.id ?? 111,
  title: over.title ?? "Waxed Canvas Field Jacket",
  handle: over.handle ?? "waxed-canvas-field-jacket",
  vendor: over.vendor ?? "Taylor Stitch",
  product_type: over.product_type ?? "Outerwear",
  tags: over.tags ?? ["olive", "waxed", "jacket"],
  body_html: "<p>lots of description we never read</p>",
  variants: over.variants ?? [{ price: "198.00", available: true }],
  images: over.images ?? [{ src: "https://cdn.shopify.com/s/files/1/jacket.jpg" }],
});

before(async () => {
  fake = await startFakeUpstash();
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  store = createServer((req, res) => {
    requests += 1;
    const url = new URL(req.url, "http://x");
    if (url.pathname !== "/products.json") {
      res.writeHead(404).end();
      return;
    }
    // Page two is empty, which is how a catalogue ends.
    const page = Number(url.searchParams.get("page") ?? 1);
    const products =
      page > 1
        ? []
        : [
            product(),
            product({ id: 112, title: "Shetland Wool Crewneck", handle: "shetland-crewneck", product_type: "Knitwear", tags: ["grey", "wool"], variants: [{ price: "125.00", available: true }] }),
            product({ id: 113, title: "Sold Out Chore Coat", handle: "chore", variants: [{ price: "160.00", available: false }] }),
            product({ id: 114, title: "Womens Silk Blouse", handle: "blouse", variants: [{ price: "140.00", available: true }] }),
            product({ id: 115, title: "No Photo Trousers", handle: "trousers", images: [], variants: [{ price: "120.00", available: true }] }),
          ];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ products }));
  });
  await new Promise((r) => store.listen(0, "127.0.0.1", r));
  origin = `127.0.0.1:${store.address().port}`;

  shopify = await import("../lib/sources/shopify.ts");
});

after(async () => {
  await fake.close();
  store.closeAllConnections();
  await new Promise((r) => store.close(r));
});

test("off unless a store is named", () => {
  delete process.env.SHOPIFY_STORES;
  assert.equal(shopify.shopifyConfigured(), false);
  process.env.SHOPIFY_STORES = "  https://Example.com/collections/all , ";
  assert.equal(shopify.shopifyConfigured(), true, "a pasted URL is still a domain");
});

test("a catalogue page becomes garments, and the unusable are dropped", () => {
  const garments = shopify.parseCatalogue(
    {
      products: [
        product(),
        product({ id: 113, title: "Sold Out Chore Coat", variants: [{ price: "160.00", available: false }] }),
        product({ id: 114, title: "Womens Silk Blouse" }),
        product({ id: 115, title: "No Photo Trousers", images: [] }),
        { title: "" },
      ],
    },
    "example.com"
  );

  assert.equal(garments.length, 1, "sold out, womenswear, and photoless all go");
  assert.equal(garments[0].title, "Waxed Canvas Field Jacket");
  assert.equal(garments[0].price, 198);
  assert.equal(garments[0].vendor, "Taylor Stitch");
});

test("the cheapest buyable variant sets the price", () => {
  const [garment] = shopify.parseCatalogue(
    {
      products: [
        product({
          variants: [
            { price: "60.00", available: false },
            { price: "198.00", available: true },
            { price: "150.00", available: true },
          ],
        }),
      ],
    },
    "example.com"
  );
  assert.equal(garment.price, 150, "not the sixty nobody can buy");
});

test("the parse says what it threw away, and why", () => {
  const { garments, dropped } = shopify.explainCatalogue(
    {
      products: [
        product(),
        product({ id: 2, title: "Womens Silk Blouse" }),
        product({ id: 3, title: "Sold Out Chore Coat", variants: [{ price: "160.00", available: false }] }),
        product({ id: 4, title: "No Photo Trousers", images: [] }),
        null,
      ],
    },
    "example.com"
  );

  assert.equal(garments.length, 1);
  assert.deepEqual(dropped, { seen: 5, malformed: 1, title: 1, soldOut: 1, noImage: 1 });
});

test("a payload that is not a catalogue is nothing, not a crash", () => {
  for (const junk of [null, {}, { products: "no" }, { products: [null] }, "<html>"]) {
    assert.deepEqual(shopify.parseCatalogue(junk, "example.com"), []);
  }
});

test("matching is on the words the store itself used", () => {
  const garment = { title: "Waxed Canvas Field Jacket", vendor: "Taylor Stitch", type: "Outerwear", tags: ["olive"] };
  assert.equal(shopify.scoreAgainst(garment, shopify.tokenise("waxed canvas field jacket")), 1);
  assert.ok(shopify.scoreAgainst(garment, shopify.tokenise("olive waxed field jacket")) >= 0.5);
  assert.ok(shopify.scoreAgainst(garment, shopify.tokenise("suede chelsea boot brown")) < 0.5);
  assert.deepEqual(shopify.tokenise("a waxed  field-jacket!"), ["waxed", "field", "jacket"]);
});

test("a search reads the store once and answers from the words in it", async () => {
  process.env.SHOPIFY_STORES = origin;
  requests = 0;

  const found = await shopify.search({ query: "waxed canvas field jacket", range: { min: 50, max: 400 } });
  assert.equal(found.length, 1);
  assert.equal(found[0].title, "Waxed Canvas Field Jacket");
  assert.equal(found[0].source, "shopify");
  assert.equal(found[0].merchant, "Taylor Stitch");
  assert.equal(found[0].condition, "New");
  assert.ok(found[0].url.endsWith("/products/waxed-canvas-field-jacket"));
  assert.equal(found[0].matchedQuery, "waxed canvas field jacket");

  const before = requests;
  const again = await shopify.search({ query: "shetland wool crewneck", range: { min: 50, max: 400 } });
  assert.equal(again.length, 1, "the second query is answered from the cached catalogue");
  assert.equal(requests, before, "and cost the store nothing");
});

test("the price range still applies", async () => {
  process.env.SHOPIFY_STORES = origin;
  const found = await shopify.search({ query: "waxed canvas field jacket", range: { min: 20, max: 100 } });
  assert.equal(found.length, 0, "a 198 jacket is not in a 20-100 budget");
});

test("a store that cannot be reached is skipped, not fatal", async () => {
  process.env.SHOPIFY_STORES = `${origin},127.0.0.1:1`;
  const found = await shopify.search({ query: "shetland wool crewneck", range: { min: 50, max: 400 } });
  assert.equal(found.length, 1, "the live store still answered");
});

test("many stores are read a few at a time, not all at once", async () => {
  // Twelve stores that report how many were being read simultaneously.
  let live = 0;
  let peak = 0;
  const servers = await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const s = createServer((req, res) => {
        live += 1;
        peak = Math.max(peak, live);
        // Page two is empty, the way a real store's second page is: without
        // that the fetch pages to its limit and every garment arrives four times.
        const first = !/page=[2-9]/.test(req.url ?? "");
        setTimeout(() => {
          live -= 1;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ products: first ? [product({ id: i, title: `Waxed Jacket ${i}`, handle: `j${i}` })] : [] }));
        }, 60);
      });
      await new Promise((r) => s.listen(0, "127.0.0.1", r));
      return s;
    })
  );

  try {
    process.env.SHOPIFY_STORES = servers.map((s) => `127.0.0.1:${s.address().port}`).join(",");
    const found = await shopify.search({ query: "waxed canvas field jacket", range: { min: 50, max: 400 } });

    assert.equal(found.length, 12, "every store answered");
    assert.ok(peak <= 6, `no more than six at once, saw ${peak}`);
  } finally {
    // In a finally because a listening server keeps the runner alive forever:
    // a failed assertion above would hang the suite rather than fail it.
    await Promise.all(
      servers.map((s) => {
        s.closeAllConnections();
        return new Promise((r) => s.close(r));
      })
    );
  }
});

test("warming reads every store and says what it got", async () => {
  const server = createServer((req, res) => {
    const first = !/page=[2-9]/.test(req.url ?? "");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ products: first ? [product(), product({ id: 2, handle: "b", title: "Shetland Crewneck" })] : [] }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  try {
    process.env.SHOPIFY_STORES = `127.0.0.1:${server.address().port},127.0.0.1:1`;
    const warmed = await shopify.warmShopifyCatalogues();
    assert.equal(warmed.stores, 1, "the dead one is not counted, and did not throw");
    assert.equal(warmed.garments, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
