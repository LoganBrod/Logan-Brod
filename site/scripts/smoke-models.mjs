// Does every model in the routing table actually accept the calls this app makes?
//
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/smoke-models.mjs
//
// Not a test — a pre-flight. `npm test` never touches the network, so nothing
// in it would notice if a model rejected `output_config.effort`, or refused a
// structured-output schema, or wouldn't take an image. Those are 400s that only
// appear on a real call, and the first person to find one should be you rather
// than somebody trying to build a closet.
//
// The point is to exercise the exact call *shape* the app uses — messages.parse
// with an effort level and a zod schema, and the same thing again with an image
// attached — against every model in MODELS, for a couple of cents. It does not
// check answer quality. A model can pass this and still be the wrong choice.
//
// Reads the key from the environment only. Do not paste one into this file.

import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODELS, anthropic, assertNotRefused, describeApiError, requireParsed } from "../lib/anthropic.ts";
import { PRICES } from "../lib/meter.ts";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "\nANTHROPIC_API_KEY is not set.\n\n" +
      "  ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/smoke-models.mjs\n\n" +
      "or put it in site/.env.local (gitignored) and run:\n\n" +
      "  set -a; . .env.local; set +a; npx tsx scripts/smoke-models.mjs\n"
  );
  process.exit(1);
}

// A schema shaped like the app's — an object with a string, an enum and a
// number — so it exercises structured output rather than a trivial one-field
// answer that any model would manage.
const Answer = z.object({
  colour: z.string(),
  formality: z.enum(["casual", "smart", "formal"]),
  confidence: z.number(),
});

// A real 32x32 olive PNG, generated rather than typed — an invalid image comes
// back as a 400 and would read here as the model rejecting the call shape,
// which is the exact thing this script exists to detect.
const OLIVE_SQUARE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGPwCjKmKWIYtWDUglEL" +
  "Ri0YtWDUglELRi0YtWDUglELhooFAE5TPC7oqc4uAAAAAElFTkSuQmCC";

/** One call, in the shape the app makes them. Returns a row for the report. */
async function attempt({ model, label, effort, withImage }) {
  const content = [
    {
      type: "text",
      text: "This is a plain olive-green swatch. Name the colour, say how formal it reads, and give a confidence between 0 and 100.",
    },
  ];
  if (withImage) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: OLIVE_SQUARE_PNG },
    });
  }

  const started = Date.now();
  try {
    const message = await anthropic().messages.parse({
      model,
      // Generous on purpose: max_tokens has to cover thinking as well as the
      // answer, and a ceiling that's too low surfaces as `parsed_output: null`
      // rather than as an error.
      max_tokens: 4000,
      output_config: { effort, format: zodOutputFormat(Answer) },
      messages: [{ role: "user", content }],
    });

    assertNotRefused(message, label);
    const parsed = requireParsed(message.parsed_output, label);

    const price = PRICES[model];
    const inTok = message.usage?.input_tokens ?? 0;
    const outTok = message.usage?.output_tokens ?? 0;

    return {
      ok: true,
      label,
      ms: Date.now() - started,
      inTok,
      outTok,
      cost: price ? (inTok / 1e6) * price.in + (outTok / 1e6) * price.out : null,
      answer: `${parsed.colour} / ${parsed.formality} / ${parsed.confidence}`,
    };
  } catch (err) {
    return { ok: false, label, ms: Date.now() - started, error: describeApiError(err) };
  }
}

// One row per (model, effort, image?) combination the app actually uses. Effort
// is per call site, not per model, so both levels get tried on anything that
// runs at both.
const CASES = [
  { job: "analyze", model: MODELS.analyze, effort: "high", withImage: true },
  { job: "curate", model: MODELS.curate, effort: "medium", withImage: true },
  { job: "judge", model: MODELS.judge, effort: "medium", withImage: true },
  { job: "wardrobeRead", model: MODELS.wardrobeRead, effort: "medium", withImage: true },
  { job: "outfits", model: MODELS.outfits, effort: "medium", withImage: false },
  { job: "fit", model: MODELS.fit, effort: "high", withImage: false },
];

// Deduplicated: several jobs share a model and an effort, and the API does not
// care which of them is asking. Running one of each keeps this at a few cents.
const seen = new Map();
for (const c of CASES) {
  const key = `${c.model}|${c.effort}|${c.withImage}`;
  if (seen.has(key)) seen.get(key).jobs.push(c.job);
  else seen.set(key, { ...c, jobs: [c.job] });
}

console.log("\nSMOKE TEST — does each model accept the calls this app makes?");
console.log("─".repeat(78));
for (const c of seen.values()) {
  console.log(
    `${c.jobs.join(", ").padEnd(28)} ${c.model.padEnd(18)} effort=${c.effort.padEnd(7)} ${
      c.withImage ? "with image" : "text only"
    }`
  );
}
console.log("─".repeat(78));

const results = await Promise.all(
  [...seen.values()].map((c) =>
    attempt({ model: c.model, label: c.jobs.join("/"), effort: c.effort, withImage: c.withImage })
  )
);

console.log();
let spent = 0;
let failed = 0;
for (const r of results) {
  if (r.ok) {
    spent += r.cost ?? 0;
    console.log(
      `  PASS  ${r.label.padEnd(28)} ${String(r.ms + "ms").padStart(7)}  ` +
        `${String(r.inTok).padStart(5)} in ${String(r.outTok).padStart(5)} out  ` +
        `${r.cost === null ? "     ?" : "$" + r.cost.toFixed(4)}  ${r.answer}`
    );
  } else {
    failed += 1;
    console.log(`  FAIL  ${r.label.padEnd(28)} ${String(r.ms + "ms").padStart(7)}`);
    console.log(`        ${r.error}`);
  }
}

console.log(`\ntotal spent: about $${spent.toFixed(4)}`);

if (failed) {
  console.log(
    `\n${failed} of ${results.length} failed. If the message mentions \`effort\` or the output\n` +
      "format, that model does not support the call shape and the job should go\n" +
      "back to claude-opus-5 in MODELS (lib/anthropic.ts). A 401 means the key is\n" +
      "wrong; a 403 means the key can't reach that model.\n"
  );
  process.exit(1);
}

console.log("\nall models accept the call shape. This says nothing about answer quality.\n");
