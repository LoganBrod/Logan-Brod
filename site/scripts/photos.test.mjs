// Regression tests for photo selection.
//
// The bug these exist for: selection logic used to run inside a React state
// updater, reading the browser's FileList lazily. React evaluates the first
// updater eagerly but defers later ones — and by then the input had been
// cleared, so only the very first photo ever landed. Keeping the rules pure and
// caller-materialised is what makes that class of bug impossible.

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PHOTOS,
  describeRejections,
  parseInlinePhotos,
  selectPhotos,
} from "../lib/photos.ts";

const img = (name = "a.jpg") => ({ name, type: "image/jpeg" });

test("a second selection still adds, given room", () => {
  const first = selectPhotos(0, [img("one.jpg")]);
  assert.equal(first.accepted.length, 1);

  // The regression: this used to come back empty.
  const second = selectPhotos(1, [img("two.jpg")]);
  assert.equal(second.accepted.length, 1);
  assert.equal(second.accepted[0].name, "two.jpg");
});

test("the cap holds across separate selections, not just one", () => {
  let total = 0;
  for (let i = 0; i < 10; i++) {
    total += selectPhotos(total, [img(`${i}.jpg`)]).accepted.length;
  }
  assert.equal(total, MAX_PHOTOS);
});

test("one oversized selection is trimmed to the room available", () => {
  const selection = selectPhotos(4, [img("a.jpg"), img("b.jpg"), img("c.jpg")]);
  assert.equal(selection.accepted.length, 2);
  assert.equal(selection.rejectedForCap, 1);
});

test("a full closet accepts nothing more", () => {
  const selection = selectPhotos(MAX_PHOTOS, [img()]);
  assert.equal(selection.accepted.length, 0);
  assert.equal(selection.rejectedForCap, 1);
});

test("non-images are filtered and counted separately", () => {
  const selection = selectPhotos(0, [
    img("good.jpg"),
    { name: "notes.pdf", type: "application/pdf" },
    { name: "clip.mov", type: "video/quicktime" },
  ]);
  assert.equal(selection.accepted.length, 1);
  assert.equal(selection.rejectedForType, 2);
  assert.equal(selection.rejectedForCap, 0);
});

test("rejections are explained, and silence means nothing was dropped", () => {
  assert.equal(describeRejections(selectPhotos(0, [img()])), null);

  const overCap = describeRejections(selectPhotos(5, [img(), img(), img()]));
  assert.match(overCap, /6 photos is the limit/);

  const badType = describeRejections(
    selectPhotos(0, [{ name: "notes.pdf", type: "application/pdf" }])
  );
  assert.match(badType, /wasn't an image/);
});

// --- what arrives over the wire ------------------------------------------
//
// Two routes take photos now: analyze reads them, and curate holds them up
// against each candidate. The check they share lives in one place so it can't
// drift into being stricter on one route than the other.

const inline = (over = {}) => ({ data: "AAAA", mediaType: "image/jpeg", ...over });

test("a well-formed photo survives, and junk around it doesn't", () => {
  const parsed = parseInlinePhotos([
    inline(),
    null,
    "not an object",
    { data: "AAAA" },
    { mediaType: "image/jpeg" },
    inline({ data: "" }),
    inline({ mediaType: "image/svg+xml" }),
    inline({ mediaType: "text/html" }),
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].mediaType, "image/jpeg");
});

test("a malformed entry drops itself, not the whole upload", () => {
  // Refusing the request would mean one unreadable photo out of six costs a
  // person their whole run.
  const parsed = parseInlinePhotos([inline(), { data: 7 }, inline()]);
  assert.equal(parsed.length, 2);
});

test("anything that isn't an array is no photos at all", () => {
  for (const raw of [undefined, null, "photos", 3, {}]) {
    assert.deepEqual(parseInlinePhotos(raw), []);
  }
});

test("the count is capped, and the cap can be tightened per caller", () => {
  const many = Array.from({ length: 20 }, () => inline());
  assert.equal(parseInlinePhotos(many).length, MAX_PHOTOS);
  // Curation repeats its copies in every batch, so it asks for fewer.
  assert.equal(parseInlinePhotos(many, 4).length, 4);
});
