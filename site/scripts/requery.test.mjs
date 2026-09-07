// The second search: what code enforces after the model has been asked.
//
//   npm test
//
// The prompt says "never repeat a search that was tried". Prompts are asked;
// this is where it is enforced, along with the same slot and maker caps the
// first pass has, so a repair cannot hand the run eight pairs of boots.

import assert from "node:assert/strict";
import test from "node:test";
import { FOOTWEAR_QUERY_CAP, MAX_QUERIES_PER_SLOT } from "../lib/categories.ts";
import { MAX_NAMED_MAKER_QUERIES } from "../lib/analyze.ts";
import { MAX_REQUERIES, MIN_GOOD_PICKS, dedupe } from "../lib/requery.ts";

const q = (query, category = "outerwear") => ({ query, category, reason: "because" });

test("a replacement that repeats a tried search is dropped, however it is spelled", () => {
  const tried = ["Waxed cotton field jacket, olive", "selvedge denim jacket"];
  const out = dedupe(
    [
      q("waxed cotton field jacket olive"),
      q("SELVEDGE DENIM JACKET!"),
      q("moleskin chore coat brown"),
    ],
    tried
  );
  assert.deepEqual(
    out.map((x) => x.query),
    ["moleskin chore coat brown"]
  );
});

test("replacements that repeat each other collapse to one", () => {
  const out = dedupe([q("wool overshirt grey"), q("Wool overshirt, grey"), q("wool overshirt grey ")], []);
  assert.equal(out.length, 1);
});

test("the slot caps from the first pass still apply", () => {
  const boots = Array.from({ length: 5 }, (_, i) => q(`boot ${i}`, "footwear"));
  const shirts = Array.from({ length: 6 }, (_, i) => q(`shirt ${i}`, "tops"));
  const out = dedupe([...boots, ...shirts], [], [], 20);
  assert.equal(out.filter((x) => x.category === "footwear").length, FOOTWEAR_QUERY_CAP);
  assert.equal(out.filter((x) => x.category === "tops").length, MAX_QUERIES_PER_SLOT);
});

test("named makers stay capped so a repair cannot become a brand list", () => {
  const out = dedupe(
    [q("Barbour Bedale jacket"), q("Barbour Beaufort jacket", "tops"), q("Barbour liddesdale", "bottoms"), q("cotton chinos olive", "bottoms")],
    [],
    ["Barbour"],
    20
  );
  assert.equal(out.filter((x) => /barbour/i.test(x.query)).length, MAX_NAMED_MAKER_QUERIES);
  assert.ok(out.some((x) => x.query === "cotton chinos olive"));
});

test("never more than MAX_REQUERIES, and the run's threshold is half a closet", () => {
  const many = Array.from({ length: 12 }, (_, i) => q(`piece ${i}`, ["tops", "bottoms", "outerwear", "knitwear"][i % 4]));
  assert.equal(dedupe(many, []).length, MAX_REQUERIES);
  assert.equal(MIN_GOOD_PICKS, 6);
});

test("blank and punctuation-only replacements are not searches", () => {
  const out = dedupe([q(""), q("   "), q("???"), q("linen shirt white")], []);
  assert.deepEqual(
    out.map((x) => x.query),
    ["linen shirt white"]
  );
});
