// What one closet actually costs to serve.
//
//   npx tsx scripts/cost-model.mjs
//
// Not a test — a calculator. Every number below is either read out of the code
// or stated as an assumption you can change. The point is that the assumptions
// are visible: the honest version of "what does a run cost" is a range with the
// uncertain parts labelled, not a single figure.
//
// Run under tsx rather than bare node so the pipeline constants are *imported*
// from the modules that define them. They used to be copied here, and they went
// stale in the worst possible direction: this said three curate calls while the
// code ran six, so every figure it printed was half of the real bill.
//
// The one number that is genuinely unknown until you meter production is how
// many tokens the model *thinks* before answering. Thinking is billed as
// output, output is several times the price of input, and it therefore
// dominates. So this prints three scenarios rather than one.

import { MODELS } from "../lib/anthropic.ts";
import { MAX_BATCHES, MAX_VIEWED, PICKS_PER_BATCH } from "../lib/batching.ts";

// --- prices ---------------------------------------------------------------
// Per million tokens, by model id.
const PRICES = {
  "claude-opus-5": { in: 5.0, out: 25.0 },
  "claude-sonnet-5": { in: 2.0, out: 10.0 },
  "claude-haiku-4-5-20251001": { in: 1.0, out: 5.0 },
};

const usd = (n) => `$${n.toFixed(4)}`;

function cost(model, inTok, outTok) {
  const price = PRICES[model];
  if (!price) throw new Error(`No price on file for ${model}. Add it to PRICES.`);
  return (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;
}

/**
 * Tokens for one image.
 *
 * Claude bills an image at roughly (width × height) / 750 tokens. Every image
 * path in this app is bounded, which is why the numbers below are as low as
 * they are:
 *   - uploads are downscaled in the browser to MAX_EDGE = 1568 (lib/image.ts)
 *   - the copies sent to curation are REFERENCE_EDGE = 256 (lib/image.ts)
 *   - eBay photos are rewritten to /s-l400/ before fetching (lib/sources/menswear.ts)
 */
const imageTokens = (w, h) => Math.round((w * h) / 750);

const UPLOAD = imageTokens(1568, 1176); // a 4:3 phone photo at the 1568 cap
const REFERENCE = imageTokens(256, 192); // the same photo, as curation sees it
const THUMB = imageTokens(400, 400); // an eBay s-l400 thumbnail, square worst case

// --- measured prompt sizes ------------------------------------------------
// Character counts of the SYSTEM literals, divided by ~3.7 chars/token.
const SYSTEM = { analyze: 384, curate: 500, judge: 288, fit: 342 };

const SWEEP_CAP = 24; // lib/sweep.ts — candidates a sweep looks at
const MAX_REFERENCE = 4; // lib/curate.ts — uploads repeated in every batch

/**
 * Thinking volume, as a fraction of each call's max_tokens.
 *
 * Nobody knows these until production is metered. They are the whole
 * uncertainty in this model, so they are the only thing that varies between
 * the three scenarios.
 */
const SCENARIOS = {
  lean: 0.15,
  likely: 0.35,
  heavy: 0.7,
};

function closetRun(photos, thinkFraction) {
  // Pass 1 — read the style off the uploads. effort: high, max_tokens 8000.
  const analyzeIn = SYSTEM.analyze + 120 + photos * UPLOAD;
  const analyzeOut = Math.round(8000 * thinkFraction) + 900; // + the profile JSON

  // Pass 2 — MAX_BATCHES parallel calls, each judging MAX_VIEWED photos, and
  // each also carrying thumbnails of what the person uploaded. effort: medium.
  const labels = MAX_VIEWED * 27; // "id | $price | condition | title"
  const reference = Math.min(photos, MAX_REFERENCE) * REFERENCE;
  const curateIn = SYSTEM.curate + 250 + 400 + labels + MAX_VIEWED * THUMB + reference;
  const curateOut = Math.round(8000 * thinkFraction * 0.6) + 400; // medium effort thinks less

  return {
    analyze: {
      in: analyzeIn,
      out: analyzeOut,
      cost: cost(MODELS.analyze, analyzeIn, analyzeOut),
    },
    curate: {
      in: curateIn * MAX_BATCHES,
      out: curateOut * MAX_BATCHES,
      cost: cost(MODELS.curate, curateIn, curateOut) * MAX_BATCHES,
    },
    get total() {
      return this.analyze.cost + this.curate.cost;
    },
  };
}

function sweep(fresh, thinkFraction) {
  const labels = fresh * 27;
  const inTok = SYSTEM.curate + 250 + 400 + labels + fresh * THUMB;
  const outTok = Math.round(8000 * thinkFraction * 0.6) + 400;
  return cost(MODELS.curate, inTok, outTok);
}

function judgement(thinkFraction) {
  const inTok = SYSTEM.judge + 150 + imageTokens(800, 800); // a listing photo, unbounded-ish
  const outTok = Math.round(4000 * thinkFraction) + 350;
  return cost(MODELS.judge, inTok, outTok);
}

function fitLookup(thinkFraction) {
  // Three pages of scraped text, capped at 6000 chars each (lib/websearch.ts).
  const inTok = SYSTEM.fit + 100 + Math.round((3 * 6000) / 3.7);
  const outTok = Math.round(6000 * thinkFraction) + 500;
  return cost(MODELS.fit, inTok, outTok);
}

// --- report ---------------------------------------------------------------
console.log("\nWHICH MODEL DOES WHAT");
console.log("─".repeat(74));
for (const [job, model] of Object.entries(MODELS)) {
  const price = PRICES[model];
  console.log(job.padEnd(16) + model.padEnd(28) + `$${price.in}/M in, $${price.out}/M out`);
}

console.log(`\none uploaded photo (1568×1176) ....... ${UPLOAD.toLocaleString()} tokens`);
console.log(`the same photo for curation (256px) .. ${REFERENCE.toLocaleString()} tokens`);
console.log(`one eBay thumbnail (400×400) ......... ${THUMB.toLocaleString()} tokens\n`);

console.log(
  `pipeline: 1 analyze, then ${MAX_BATCHES} curate calls of ${MAX_VIEWED}, ${PICKS_PER_BATCH} picks each\n`
);

console.log("ONE CLOSET RUN, by how much the model thinks");
console.log("─".repeat(74));
console.log(
  "photos".padEnd(8) +
    Object.keys(SCENARIOS)
      .map((s) => s.padStart(22))
      .join("")
);
for (const photos of [1, 3, 6]) {
  const row = Object.values(SCENARIOS).map((f) => usd(closetRun(photos, f).total).padStart(22));
  console.log(String(photos).padEnd(8) + row.join(""));
}

console.log("\nWHERE THE MONEY GOES (3 photos, 'likely')");
console.log("─".repeat(74));
const r = closetRun(3, SCENARIOS.likely);
for (const [name, p] of [
  [`analyze  (1 call, high effort, ${MODELS.analyze})`, r.analyze],
  [`curate   (${MAX_BATCHES} calls, medium effort, ${MODELS.curate})`, r.curate],
]) {
  console.log(
    name.padEnd(52) +
      `${p.in.toLocaleString().padStart(8)} in` +
      `${p.out.toLocaleString().padStart(8)} out` +
      usd(p.cost).padStart(12)
  );
}
console.log("".padEnd(52) + "".padStart(16) + usd(r.total).padStart(28));

// What the same run would have cost with Opus everywhere, which is what it did
// cost until the jobs were split up.
const asOpus =
  cost("claude-opus-5", r.analyze.in, r.analyze.out) +
  cost("claude-opus-5", r.curate.in, r.curate.out);
console.log(
  `\nthe same run with Opus on every pass: ${usd(asOpus)} — routing saves ${Math.round(
    (1 - r.total / asOpus) * 100
  )}%`
);

const inputShare =
  (cost(MODELS.analyze, r.analyze.in, 0) + cost(MODELS.curate, r.curate.in, 0)) / r.total;
console.log(
  `input is ${Math.round(inputShare * 100)}% of the bill; the model's own output is the rest.`
);

console.log("\nEVERYTHING ELSE, per action ('likely')");
console.log("─".repeat(74));
const f = SCENARIOS.likely;
for (const [label, value] of [
  ["one judgement ('is this any good?')", judgement(f)],
  ["one brand-fit lookup (+1 SerpAPI search)", fitLookup(f)],
  [`one watch sweep, ${SWEEP_CAP} fresh listings (worst case)`, sweep(SWEEP_CAP, f)],
  ["one watch sweep, 6 fresh listings (typical)", sweep(6, f)],
  ["one watch sweep, 0 fresh listings (most days)", 0],
]) {
  console.log(label.padEnd(52) + usd(value).padStart(12));
}

console.log("\nA MEMBER'S MONTHLY MODEL SPEND");
console.log("─".repeat(74));
for (const [watches, freshPerSweep, sweepsPerDay] of [
  [10, 6, 2],
  [10, 2, 2],
  [3, 6, 2],
  [3, 6, 1],
]) {
  const sweeps = watches * sweepsPerDay * 30;
  const monthly = sweeps * sweep(freshPerSweep, f) + 4 * closetRun(3, f).total;
  console.log(
    `${watches} watches, ${freshPerSweep} fresh/sweep, ${sweepsPerDay}×/day`.padEnd(38) +
      `${sweeps} sweeps`.padStart(14) +
      `$${monthly.toFixed(2)}/mo`.padStart(14)
  );
}
console.log("\n(each row also assumes 4 closet runs a month)\n");
