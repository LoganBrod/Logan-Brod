// Judging one piece: the URL guard and the metadata reader.
//
//   npm test
//
// The guard matters most. This endpoint fetches a URL a stranger supplied,
// which is the classic way to turn a server into a probe for whatever sits on
// its own network — so the tests below are mostly about what it refuses.

import assert from "node:assert/strict";
import test from "node:test";
import { fetchableUrl, readMetadata } from "../lib/judge.ts";

test("ordinary listing links are fetchable", () => {
  for (const url of [
    "https://www.ebay.com/itm/123456",
    "http://example.com/product?id=1",
    "https://shop.example.co.uk/a/b",
  ]) {
    assert.ok(fetchableUrl(url), url);
  }
});

test("anything that isn't a web page is refused", () => {
  for (const url of ["", "not a url", "ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)"]) {
    assert.equal(fetchableUrl(url), null, url);
  }
});

test("the server's own network is not browsable", () => {
  for (const url of [
    "http://localhost/admin",
    "http://127.0.0.1:6379/",
    "http://[::1]/",
    "http://10.0.0.5/",
    "http://172.16.4.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://redis.internal/",
  ]) {
    assert.equal(fetchableUrl(url), null, url);
  }
});

test("a public address that merely looks private isn't refused", () => {
  // 172.15 and 172.32 are outside the private block; only 16-31 is reserved.
  assert.ok(fetchableUrl("http://172.15.0.1/"));
  assert.ok(fetchableUrl("http://172.32.0.1/"));
  assert.ok(fetchableUrl("http://11.0.0.1/"));
});

test("metadata is read whichever order the attributes come in", () => {
  const a = readMetadata('<meta property="og:title" content="Waxed Jacket"><meta property="og:image" content="https://x/y.jpg">');
  assert.equal(a.title, "Waxed Jacket");
  assert.equal(a.imageUrl, "https://x/y.jpg");

  const b = readMetadata('<meta content="Reversed Jacket" property="og:title">');
  assert.equal(b.title, "Reversed Jacket");
});

test("the title falls back to the page's own", () => {
  assert.equal(readMetadata("<title>Barbour Beaufort</title>").title, "Barbour Beaufort");
  assert.equal(readMetadata("<html></html>").title, undefined);
});

test("entities in a title are decoded, not shown", () => {
  const meta = readMetadata('<meta property="og:title" content="Levi&#39;s 501 &amp; Co">');
  assert.equal(meta.title, "Levi's 501 & Co");
});

test("a price is found in metadata or in the page's own JSON", () => {
  assert.equal(readMetadata('<meta property="product:price:amount" content="189.99">').price, 189.99);
  assert.equal(readMetadata('{"price": "245.00"}').price, 245);
  // Currency symbols and thousands separators are stripped, because real pages
  // are full of them. Note this assumes a dot decimal separator — a European
  // "1.200,00" would read as 1.2, which is wrong but not wrong for a US app.
  assert.equal(readMetadata('<meta property="og:price:amount" content="$1,200">').price, 1200);
});

test("a page with no price simply has none", () => {
  assert.equal(readMetadata("<html><title>x</title></html>").price, undefined);
  assert.equal(readMetadata('{"price": "0"}').price, undefined);
});
