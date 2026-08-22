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

// --- what the photographs are allowed to be overruled by --------------------
//
// The bug: "I put in a completely different vibe and it still takes over the
// vibe from my last submission." The taste memory was handed to the step whose
// entire job is reading the new photographs, phrased as a standing fact about
// the person — so the model answered a blend of two questions, and since this
// step writes the search queries, the blend decided everything downstream.

test("the analysis step is not given the taste memory at all", () => {
  // Not a matter of ordering or wording. It reads the photographs; a paragraph
  // about what somebody clicked last month is not evidence about this upload.
  const signature = src.slice(
    src.indexOf("export async function analyzeStyle"),
    src.indexOf("): Promise<StyleProfile>")
  );
  assert.ok(!/tasteMemo/.test(signature), "analyzeStyle still accepts a taste memo");

  // Comments stripped first: the doc block above `analyzeStyle` names the taste
  // memo deliberately, to say why it isn't here. That mention should survive;
  // any *code* mention should not.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/tasteMemo/.test(code), "lib/analyze.ts still uses the taste memo in code");
});

test("the analysis route doesn't fetch a memo to pass anyway", () => {
  const route = readFileSync("app/api/style/analyze/route.ts", "utf8");
  assert.ok(!/tasteMemo/.test(route), "the analyze route still reads the taste memo");
});

test("the prompt says the photographs are the whole account", () => {
  assert.match(src, /photographs are the only account of their style/i);
  assert.match(src, /not what somebody with these clothes is generally like/i);
});

test("the memory is framed as history, and yields to the profile", () => {
  const taste = readFileSync("lib/taste.ts", "utf8");
  assert.match(taste, /history, not instruction/i);
  assert.match(taste, /previous/i);
  // The load-bearing sentence: it must not be able to outvote the profile.
  assert.match(taste, /Never use it to prefer a piece that fits this history/i);
  assert.match(taste, /the profile is right and this is out of date/i);
  // And the old wording, which read as a standing instruction, is gone.
  assert.ok(
    !/Lean toward what earns their attention/.test(taste),
    "the memo still tells the model to lean toward past behaviour"
  );
});

test("curation still gets it — that's where a tie-breaker belongs", () => {
  const curate = readFileSync("lib/curate.ts", "utf8");
  assert.match(curate, /tasteMemo/, "curation lost the memory entirely");
  assert.match(curate, /tie-breaker/i);
});
