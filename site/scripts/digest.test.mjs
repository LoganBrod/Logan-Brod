// The unprompted email.
//
//   npm test
//
// Everything in here arrives in someone's inbox without being asked for, which
// sets the bar: titles come from sellers and go straight into HTML, so escaping
// is not cosmetic, and a sizing note that appears on the wrong piece is worse
// than one that never appears.

import assert from "node:assert/strict";
import test from "node:test";

const { digestBody } = await import("../lib/mail.ts");

const item = (overrides = {}) => ({
  title: "Barbour Bedale waxed jacket",
  price: 128.5,
  url: "https://example.com/listing/1",
  whyItFits: "The waxed cotton and the olive sit exactly where your uploads did.",
  condition: "Pre-owned",
  ...overrides,
});

test("one find reads as one find", () => {
  const { subject, text, html } = digestBody("Waxed workwear", [item()]);
  assert.equal(subject, 'A piece for "Waxed workwear"');
  assert.match(text, /Something turned up/);
  assert.match(html, /Something turned up\./);
});

test("several finds are counted in the subject", () => {
  const { subject, html } = digestBody("Waxed workwear", [item(), item(), item()]);
  assert.equal(subject, '3 pieces for "Waxed workwear"');
  assert.match(html, /A few things turned up\./);
});

test("the price is written with cents, once per item", () => {
  const { text, html } = digestBody("W", [item()]);
  assert.match(text, /\$128\.50/);
  assert.match(html, /\$128\.50/);
});

test("a seller's title can't inject markup", () => {
  const nasty = item({
    title: 'Jacket <script>alert("x")</script> & "quoted"',
  });
  const { html } = digestBody("W", [nasty]);

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&quot;quoted&quot;/);
});

test("a watch name can't inject markup either", () => {
  const { html } = digestBody("<img src=x onerror=1>", [item()]);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

// ------------------------------------------------------------- sizing notes

test("no sizing block when there's nothing to say", () => {
  const { html, text } = digestBody("W", [item()]);
  assert.doesNotMatch(html, /Sizing/);
  assert.doesNotMatch(text, /Sizing/);
});

test("a sizing note appears in both halves of the email", () => {
  const withFit = item({ fitNote: "Barbour: you were told L, runs small." });
  const { html, text } = digestBody("W", [withFit]);

  assert.match(text, /Sizing — Barbour: you were told L, runs small\./);
  assert.match(html, /Sizing &mdash; Barbour: you were told L, runs small\./);
});

test("a sizing note is escaped like everything else", () => {
  const withFit = item({ fitNote: 'Runs small <b>very</b> & "so"' });
  const { html } = digestBody("W", [withFit]);
  assert.doesNotMatch(html, /<b>very<\/b>/);
  assert.match(html, /&lt;b&gt;very/);
});

test("a note attaches only to the piece it belongs to", () => {
  const { text } = digestBody("W", [
    item({ title: "Barbour Bedale", fitNote: "Barbour: you were told L." }),
    item({ title: "Belstaff Trialmaster" }),
  ]);

  const belstaff = text.slice(text.indexOf("Belstaff"));
  assert.doesNotMatch(belstaff, /Sizing/, "the second piece has no note of its own");
});

test("the footer points at the page that can stop it", () => {
  const { html } = digestBody("W", [item()]);
  assert.match(html, /Scan page/);
});

test("a missing condition is simply absent, not blank punctuation", () => {
  const { text, html } = digestBody("W", [item({ condition: undefined })]);
  assert.doesNotMatch(text, /\(\)/);
  assert.doesNotMatch(html, /&middot;\s*<\/p>/);
});
