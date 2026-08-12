// Turn COST_LOG output into the tables in docs/COSTS.md.
//
//   COST_LOG=1 npm run dev 2>&1 | tee /tmp/run.log
//   node scripts/cost-report.mjs < /tmp/run.log
//
// Reads the JSON lines `lib/meter.ts` prints, groups them by operation, and
// reports what each one actually cost. Anything that isn't a COST line is
// ignored, so piping a whole server log through this is fine.

import { createInterface } from "node:readline";

const rows = [];
for await (const line of createInterface({ input: process.stdin })) {
  const start = line.indexOf('{"tag":"COST"');
  if (start === -1) continue;
  try {
    rows.push(JSON.parse(line.slice(start)));
  } catch {
    // A truncated line is one lost sample, not a reason to stop.
  }
}

if (!rows.length) {
  console.error("No COST lines found. Was COST_LOG=1 set on the server process?");
  process.exit(1);
}

const byOp = new Map();
for (const r of rows) {
  const g = byOp.get(r.op) ?? { calls: 0, in: 0, out: 0, cacheRead: 0, cacheWrite: 0, images: 0, imageTokens: 0, cost: 0, dims: new Map() };
  g.calls += 1;
  for (const k of ["in", "out", "cacheRead", "cacheWrite", "images", "imageTokens", "cost"]) g[k] += r[k] ?? 0;
  for (const d of r.imageDims ?? []) g.dims.set(d, (g.dims.get(d) ?? 0) + 1);
  byOp.set(r.op, g);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log("\n| operation | calls | input | output | cache read | images | image tokens | cost |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
let total = 0;
for (const [op, g] of [...byOp].sort((a, b) => b[1].cost - a[1].cost)) {
  total += g.cost;
  console.log(
    `| \`${op}\` | ${g.calls} | ${g.in.toLocaleString()} | ${g.out.toLocaleString()} | ${g.cacheRead.toLocaleString()} | ${g.images} | ${g.imageTokens.toLocaleString()} | $${g.cost.toFixed(4)} |`
  );
}
console.log(`| **total** | ${rows.length} | | | | | | **$${total.toFixed(4)}** |`);

console.log("\nImage dimensions actually sent:");
for (const [op, g] of byOp) {
  if (!g.dims.size) continue;
  const list = [...g.dims].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d}×${n}`);
  console.log(`  ${pad(op, 20)} ${list.join("  ")}`);
}

// The share of the bill that is the model's own output. This is the number that
// decides whether image handling or effort settings are the lever worth pulling.
const inputCost = rows.reduce((s, r) => s + ((r.in ?? 0) / 1e6) * 5, 0);
console.log(`\nInput is ${Math.round((inputCost / total) * 100)}% of the bill; output is the rest.`);

// Cache hit rate — zero unless cache_control has been added somewhere.
const reads = rows.reduce((s, r) => s + (r.cacheRead ?? 0), 0);
const writes = rows.reduce((s, r) => s + (r.cacheWrite ?? 0), 0);
const uncached = rows.reduce((s, r) => s + (r.in ?? 0), 0);
console.log(
  reads + writes === 0
    ? "Prompt caching: not in use (no cache_control on any request)."
    : `Prompt caching: ${reads.toLocaleString()} read, ${writes.toLocaleString()} written, ${uncached.toLocaleString()} uncached — ${Math.round((reads / (reads + uncached)) * 100)}% hit rate.`
);

const curate = byOp.get("curate");
if (curate) {
  console.log(`\nCandidates reaching the vision step: ${(curate.images / curate.calls).toFixed(1)} per curate call, ${curate.images} total.`);
}
console.log();
