// The branch is the whole point of step 1, so pin which instruction each
// intent produces rather than trusting the wiring.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync("lib/analyze.ts", "utf8");

test("the gap-filling instruction is no longer unconditional", () => {
  // It used to sit in SYSTEM, which meant every run searched for what you
  // hadn't uploaded whether or not that was what you meant.
  const system = src.slice(src.indexOf("const SYSTEM"), src.indexOf("export type Intent"));
  assert.ok(!/Recommend what is missing/.test(system),
    "gap-filling is still in the unconditional system prompt");
});

test("similar tells it to return the same kind of thing", () => {
  const similar = src.slice(src.indexOf("similar: `"), src.indexOf("gaps: `"));
  assert.match(similar, /same garment types/i);
  assert.match(similar, /If every upload is outerwear, return outerwear/i);
});

test("gaps keeps the old behaviour, but only when asked", () => {
  const gaps = src.slice(src.indexOf("gaps: `"));
  assert.match(gaps, /Recommend what is missing/);
});

test("the default is similar, not gaps", () => {
  assert.match(src, /intent: Intent = "similar"/);
});

test("the route only honours an explicit opt-in", () => {
  const route = readFileSync("app/api/style/analyze/route.ts", "utf8");
  assert.match(route, /body\.intent === "gaps" \? "gaps" : "similar"/);
});
