// Prints what the brain has spent: by day, by job, and the priciest single calls.
//   npm run costs
import fs from "node:fs/promises";
import { DIRS } from "./config.js";
import { vaultPath, exists } from "./vault.js";
import { money } from "./usage.js";

type Row = { time: string; job: string; model: string; what: string; input: number; output: number; cost: number };

async function main() {
  const p = vaultPath(DIRS.system, "costs.jsonl");
  if (!(await exists(p))) { console.log("No costs recorded yet."); return; }
  const rows: Row[] = (await fs.readFile(p, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const sum = (xs: Row[]) => xs.reduce((a, r) => a + r.cost, 0);
  const by = (key: (r: Row) => string) =>
    Object.entries(rows.reduce<Record<string, Row[]>>((m, r) => ((m[key(r)] ??= []).push(r), m), {}));

  console.log(`Total: ${money(sum(rows))} over ${rows.length} calls\n`);
  console.log("By day:");
  for (const [k, v] of by((r) => r.time.slice(0, 10)).sort()) console.log(`  ${k}  ${money(sum(v)).padStart(8)}  (${v.length} calls)`);
  console.log("\nBy job:");
  for (const [k, v] of by((r) => `${r.job} · ${r.model}`)) console.log(`  ${k.padEnd(32)} ${money(sum(v)).padStart(8)}  (${v.length} calls)`);
  console.log("\nMost expensive calls:");
  for (const r of [...rows].sort((a, b) => b.cost - a.cost).slice(0, 8))
    console.log(`  ${money(r.cost).padStart(7)}  ${r.job.padEnd(8)} ${r.what.slice(0, 50).padEnd(50)} in ${r.input.toLocaleString()} / out ${r.output.toLocaleString()}`);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
