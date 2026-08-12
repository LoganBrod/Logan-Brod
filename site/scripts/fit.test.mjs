// Brand sizing: the parts that don't need a model or the network.
//
//   npm test
//
// `fitNoteFor` is the load-bearing one. It decides whether an unprompted email
// carries a line of sizing advice, and it matches a stored brand against a
// seller's listing title — which means it is matching one uncontrolled string
// against another, and getting it wrong puts confidently wrong advice in front
// of someone about to spend money.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeUpstash } from "./fake-upstash.mjs";

let stop;

before(async () => {
  const fake = await startFakeUpstash(0);
  process.env.UPSTASH_REDIS_REST_URL = fake.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test";
  stop = fake.close;
});

after(() => stop?.());

const fit = await import("../lib/fit.ts");
const websearch = await import("../lib/websearch.ts");

const advice = (overrides = {}) => ({
  recommendation: "L",
  runs: "small",
  confidence: "high",
  reasoning: "Their chart puts a 42in chest at L.",
  cautions: [],
  sources: ["Barbour size guide"],
  ...overrides,
});

const record = (brand, overrides = {}) => ({
  brand,
  category: "jacket",
  advice: advice(overrides),
  checkedAt: "2026-08-01T00:00:00.000Z",
});

// ------------------------------------------------------------------ normalize

test("brands are normalised into stable cache keys", () => {
  assert.equal(fit.normalize("Barbour"), "barbour");
  assert.equal(fit.normalize("  A.P.C.  "), "a-p-c");
  assert.equal(fit.normalize("Engineered Garments"), "engineered-garments");
  // Bounded, because this becomes part of a Redis key.
  assert.equal(fit.normalize("x".repeat(100)).length, 40);
});

test("the search query aims at charts rather than listings", () => {
  const query = fit.fitQuery("Barbour", "jacket");
  assert.match(query, /Barbour/);
  assert.match(query, /size chart/);
  assert.match(query, /run small/);
});

// --------------------------------------------------------------- fitNoteFor

test("a note is produced when a watched brand appears in the title", () => {
  const note = fit.fitNoteFor([record("Barbour")], "Vintage Barbour Bedale waxed jacket 42");
  assert.match(note, /Barbour/);
  assert.match(note, /you were told L/);
  assert.match(note, /runs small/);
});

test("brand matching ignores case in the seller's title", () => {
  assert.ok(fit.fitNoteFor([record("Barbour")], "BARBOUR BEDALE WAXED JACKET"));
  assert.ok(fit.fitNoteFor([record("barbour")], "Barbour Beaufort, mens L"));
});

test("no note when the title names no brand you've checked", () => {
  assert.equal(fit.fitNoteFor([record("Barbour")], "Belstaff Trialmaster jacket"), null);
  assert.equal(fit.fitNoteFor([], "Barbour Bedale"), null);
});

test("a true-to-size brand says so rather than saying nothing", () => {
  const note = fit.fitNoteFor([record("Filson", { runs: "true" })], "Filson Mackinaw cruiser");
  assert.match(note, /fits true to size/);
});

test("advice too thin to act on produces no note at all", () => {
  // unknown *and* low confidence is the app admitting it doesn't know. Putting
  // that in an email would be worse than staying quiet.
  const useless = record("Filson", { runs: "unknown", confidence: "low" });
  assert.equal(fit.fitNoteFor([useless], "Filson Mackinaw cruiser"), null);
});

test("an unknown fit still reports the size when the evidence was good", () => {
  const known = record("Filson", { runs: "unknown", confidence: "high", recommendation: "42" });
  const note = fit.fitNoteFor([known], "Filson Mackinaw cruiser");
  assert.match(note, /you were told 42/);
  assert.doesNotMatch(note, /runs/, "there's nothing to say about how it runs");
});

// ------------------------------------------------------------------- history

test("history is empty without an id or a lookup", async () => {
  assert.deepEqual(await fit.readHistory(null), []);
  assert.deepEqual(await fit.readHistory("fit-nobody"), []);
});

test("re-checking a brand replaces the entry rather than stacking it", async () => {
  const id = "fit-person-1";
  await fit.recordLookup(id, record("Barbour"));
  await fit.recordLookup(id, record("Barbour", { recommendation: "XL" }));

  const history = await fit.readHistory(id);
  assert.equal(history.length, 1);
  assert.equal(history[0].advice.recommendation, "XL");
});

test("the same brand in a different garment is a separate entry", async () => {
  const id = "fit-person-2";
  await fit.recordLookup(id, record("Barbour"));
  await fit.recordLookup(id, { ...record("Barbour"), category: "knitwear" });

  const history = await fit.readHistory(id);
  assert.equal(history.length, 2);
});

test("newest lookup comes first", async () => {
  const id = "fit-person-3";
  await fit.recordLookup(id, record("Barbour"));
  await fit.recordLookup(id, record("Filson"));
  const history = await fit.readHistory(id);
  assert.equal(history[0].brand, "Filson");
});

test("forgetting one lookup leaves the others", async () => {
  const id = "fit-person-4";
  await fit.recordLookup(id, record("Barbour"));
  await fit.recordLookup(id, record("Filson"));

  assert.equal(await fit.forgetLookup(id, "Barbour", "jacket"), true);
  assert.equal(await fit.forgetLookup(id, "Barbour", "jacket"), false, "already gone");

  const history = await fit.readHistory(id);
  assert.deepEqual(
    history.map((entry) => entry.brand),
    ["Filson"]
  );
});

test("forgetting matches the way it was stored, not the exact casing", async () => {
  const id = "fit-person-5";
  await fit.recordLookup(id, record("A.P.C."));
  assert.equal(await fit.forgetLookup(id, "a p c", "JACKET"), true);
});

test("a lookup can't be recorded without somewhere to put it", async () => {
  // Must not throw — history is a convenience, and losing an entry is never a
  // reason to fail a lookup that already cost a search and a model call.
  await fit.recordLookup(null, record("Barbour"));
});

// -------------------------------------------------------------- html to text

test("a size chart survives being turned into text", () => {
  const html = `
    <html><head><style>td{color:red}</style><script>var x=1</script></head>
    <body><nav>Home Shop</nav>
    <table><tr><th>Size</th><th>Chest</th></tr>
    <tr><td>M</td><td>40in</td></tr>
    <tr><td>L</td><td>42in</td></tr></table>
    </body></html>`;

  const text = websearch.textFromHtml(html);
  assert.match(text, /Size Chest/);
  assert.match(text, /L 42in/);
  // Script and style contents are gone, not merely unrendered.
  assert.doesNotMatch(text, /var x/);
  assert.doesNotMatch(text, /color:red/);
});

test("entities come back as characters", () => {
  const text = websearch.textFromHtml("<p>36&quot; &amp; 38&quot;&nbsp;chest</p>");
  assert.match(text, /36" & 38" chest/);
});

test("block tags become line breaks so rows don't run together", () => {
  const text = websearch.textFromHtml("<li>Runs small</li><li>Size up</li>");
  assert.equal(text.split("\n").length, 2);
});

test("web search is off without a key, rather than throwing", async () => {
  const key = process.env.SERPAPI_KEY;
  delete process.env.SERPAPI_KEY;
  try {
    assert.equal(websearch.webSearchConfigured(), false);
    assert.deepEqual(await websearch.search("anything"), []);
  } finally {
    if (key !== undefined) process.env.SERPAPI_KEY = key;
  }
});

test("a page on a private address is never fetched", async () => {
  // The same SSRF guard the judge uses. This route takes a URL from search
  // results, so it is reachable by anything that can influence a search.
  assert.equal(await websearch.readPage("http://169.254.169.254/latest/meta-data/"), null);
  assert.equal(await websearch.readPage("http://localhost:8080/"), null);
  assert.equal(await websearch.readPage("file:///etc/passwd"), null);
  assert.equal(await websearch.readPage("http://10.0.0.1/"), null);
});
