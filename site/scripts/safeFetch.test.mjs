// The SSRF guard, tested where it matters: on the bypasses the old hostname
// check let through. Each of these was a working attack against `fetchableUrl`
// as it stood - a URL that passed the check and would have been fetched.
//
// The form checks are pure and run offline. The redirect check stubs
// `globalThis.fetch`, so it exercises the real loop without a network.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isPrivateAddress, publicForm, publicUrl, safeFetch } from "../lib/safeFetch.ts";

// The redirect tests bypass DNS: what they check is which URLs get fetched
// after a redirect, and a real lookup would make that depend on the network.
const noDns = { resolve: async () => true };

test("the literal private ranges are refused, in every spelling", () => {
  const refused = [
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    // The numeric spellings the WHATWG parser canonicalises to 127.0.0.1.
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "http://127.1/",
    // IPv6: loopback, unspecified, unique-local, link-local, mapped, NAT64.
    "http://[::1]/",
    "http://[::]/",
    "http://[fd00::1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[64:ff9b::7f00:1]/",
  ];
  for (const url of refused) {
    assert.equal(publicUrl(url), null, `${url} should be refused`);
  }
});

test("the names that mean 'this machine' are refused", () => {
  for (const url of [
    "http://localhost/",
    "http://LOCALHOST:6379/",
    "http://redis.localhost/",
    "http://metadata.internal/",
    "http://printer.local/",
    "http://1.0.0.127.in-addr.arpa/",
  ]) {
    assert.equal(publicUrl(url), null, `${url} should be refused`);
  }
});

test("non-http schemes and embedded credentials are refused", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com/",
    "gopher://example.com/",
    "javascript:alert(1)",
    "http://user:pass@example.com/",
    "not a url",
    "",
  ]) {
    assert.equal(publicUrl(url), null, `${JSON.stringify(url)} should be refused`);
  }
});

test("ordinary public URLs pass the form check", () => {
  for (const url of [
    "https://i.ebayimg.com/images/g/abc/s-l225.jpg",
    "http://example.com/listing/123",
    "https://www.ebay.co.uk/itm/123?hash=x",
  ]) {
    assert.ok(publicUrl(url) instanceof URL, `${url} should pass`);
  }
});

test("isPrivateAddress: anything that is not an address is private", () => {
  assert.equal(isPrivateAddress("example.com"), true);
  assert.equal(isPrivateAddress(""), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700::1111"), false);
});

/**
 * Stub fetch with a scripted sequence of responses, and record every URL that
 * was actually requested. That record is the assertion: the whole point of the
 * redirect check is which URLs the server does *not* end up fetching.
 */
function scripted(responses) {
  const requested = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requested.push({ url: String(input), redirect: init?.redirect });
    const next = responses.shift();
    if (!next) throw new Error("fetch called more times than scripted");
    return new Response(next.body ?? "", { status: next.status, headers: next.headers ?? {} });
  };
  return { requested, restore: () => (globalThis.fetch = original) };
}

test("a public URL that redirects to a private address is refused at the hop", async () => {
  const stub = scripted([
    { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } },
    { status: 200, body: "SHOULD NEVER BE FETCHED" },
  ]);
  try {
    // The real resolver, deliberately: both hops are literal addresses, which
    // it judges without DNS, so this proves the production check refuses the
    // redirect target rather than proving the test seam does.
    const res = await safeFetch("http://8.8.8.8/start");
    assert.equal(res, null, "the redirect target must be refused");
    assert.equal(stub.requested.length, 1, "only the first hop may be fetched");
    assert.equal(stub.requested[0].redirect, "manual", "redirects must not be followed automatically");
  } finally {
    stub.restore();
  }
});

test("a relative redirect is resolved against the current hop, then checked", async () => {
  const stub = scripted([
    { status: 301, headers: { location: "/moved" } },
    { status: 200, body: "fine" },
  ]);
  try {
    const res = await safeFetch("http://public.example/start", {}, noDns);
    assert.ok(res, "a public-to-public redirect should be followed");
    assert.equal(res.status, 200);
    assert.deepEqual(
      stub.requested.map((r) => r.url),
      ["http://public.example/start", "http://public.example/moved"]
    );
  } finally {
    stub.restore();
  }
});

test("too many redirects gives up rather than looping", async () => {
  const stub = scripted(
    Array.from({ length: 10 }, (_, i) => ({
      status: 302,
      headers: { location: `http://public.example/hop${i + 1}` },
    }))
  );
  try {
    const res = await safeFetch("http://public.example/hop0", {}, noDns);
    assert.equal(res, null);
    assert.ok(stub.requested.length <= 4, `should stop early, fetched ${stub.requested.length}`);
  } finally {
    stub.restore();
  }
});

test("a redirect to a non-http scheme is refused", async () => {
  const stub = scripted([{ status: 302, headers: { location: "file:///etc/passwd" } }]);
  try {
    assert.equal(await safeFetch("http://public.example/start", {}, noDns), null);
    assert.equal(stub.requested.length, 1);
  } finally {
    stub.restore();
  }
});

test("publicForm and publicUrl differ only on literal addresses", () => {
  // Form is fine, address is loopback: the split that lets a fixture on
  // 127.0.0.1 be reached through the resolver seam and nothing else.
  assert.ok(publicForm("http://127.0.0.1/") instanceof URL);
  assert.equal(publicUrl("http://127.0.0.1/"), null);
  assert.equal(publicForm("http://localhost/"), null, "names are still form");
  assert.equal(publicForm("file:///x"), null, "schemes are still form");
});
