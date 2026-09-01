// Fetching product photos for the curation pass.
//
//   npm test
//
// Runs against a local server, so it's offline like everything else here. The
// property under test is containment: a photo that can't be fetched must cost
// exactly one candidate. The API rejects a message as a whole, so before this
// existed a single unfetchable URL failed all sixteen photos in its batch —
// which is what made every Google Shopping listing poison the batch it landed
// in the moment those listings started reaching curation at all.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createServer } from "node:http";
import { fetchThumbnail, withThumbnails } from "../lib/thumbnails.ts";

// The fixture is a real server on 127.0.0.1, which is exactly the address the
// SSRF guard exists to refuse. These tests are about what happens *after* a
// fetch is allowed - content types, size caps, timeouts, batch isolation - so
// they bypass the DNS check with the same parameter the guard's own tests use.
// The one test at the bottom leaves it off, to show the guard is really there.
const local = { resolve: async () => true };

/** A one-pixel PNG, which is a real image as far as any decoder is concerned. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001",
  "hex"
);

let base;
let server;

before(async () => {
  server = createServer((req, res) => {
    const route = req.url ?? "";
    if (route === "/ok.png") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PNG);
    } else if (route === "/charset.jpg") {
      // Content-Type with parameters, which is normal and used to be mishandled.
      res.writeHead(200, { "Content-Type": "image/jpeg; charset=binary" });
      res.end(PNG);
    } else if (route === "/forbidden") {
      res.writeHead(403).end("no");
    } else if (route === "/html") {
      // A CDN answering an image request with an error page.
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html>nope</html>");
    } else if (route === "/empty.png") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end();
    } else if (route === "/huge.png") {
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": "9999999" });
      res.end(PNG);
    } else if (route === "/hang") {
      // Never answers. The timeout is what has to end this.
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const listing = (id, imageUrl) => ({
  id,
  source: "ebay",
  title: id,
  price: 100,
  currency: "USD",
  url: "https://example.com",
  imageUrl,
});

test("a real image comes back as base64 with its media type", async () => {
  const image = await fetchThumbnail(`${base}/ok.png`, local);
  assert.equal(image.mediaType, "image/png");
  assert.equal(Buffer.from(image.data, "base64").length, PNG.length);
});

test("a content type with parameters is still a content type", async () => {
  const image = await fetchThumbnail(`${base}/charset.jpg`, local);
  assert.equal(image.mediaType, "image/jpeg");
});

test("anything that isn't an image is nothing", async () => {
  // CDNs answer image requests with error pages more often than they 404.
  assert.equal(await fetchThumbnail(`${base}/html`, local), null);
  assert.equal(await fetchThumbnail(`${base}/forbidden`, local), null);
  assert.equal(await fetchThumbnail(`${base}/missing.png`, local), null);
  assert.equal(await fetchThumbnail(`${base}/empty.png`, local), null);
});

test("an oversized photo is refused on the declared length", async () => {
  assert.equal(await fetchThumbnail(`${base}/huge.png`, local), null);
});

test("a host that never answers doesn't hold up the batch forever", async () => {
  const started = Date.now();
  assert.equal(await fetchThumbnail(`${base}/hang`, local), null);
  assert.ok(Date.now() - started < 8000, "the timeout didn't fire");
});

test("an unreachable host is a missing photo, not a thrown error", async () => {
  assert.equal(await fetchThumbnail("http://127.0.0.1:1/nope.png"), null);
});

test("one unfetchable photo costs one candidate, not the batch", async () => {
  const got = await withThumbnails([
    listing("a", `${base}/ok.png`),
    listing("b", `${base}/forbidden`),
    listing("c", `${base}/ok.png`),
    listing("d", undefined),
  ], local);

  assert.deepEqual(
    got.map((entry) => entry.listing.id),
    ["a", "c"]
  );
});

test("the order the candidates arrived in survives", async () => {
  const got = await withThumbnails([
    listing("first", `${base}/ok.png`),
    listing("second", `${base}/charset.jpg`),
    listing("third", `${base}/ok.png`),
  ], local);
  assert.deepEqual(
    got.map((entry) => entry.listing.id),
    ["first", "second", "third"]
  );
});

test("every photo failing is an empty list, not an exception", async () => {
  const got = await withThumbnails([listing("a", `${base}/html`), listing("b", undefined)], local);
  assert.deepEqual(got, []);
});

test("loopback is refused by the guard when nothing bypasses it", async () => {
  // Same server, same working image - and null, because 127.0.0.1 is never a
  // public address. This is the SSRF fix, observed from the outside.
  assert.equal(await fetchThumbnail(`${base}/ok.png`), null);
});
