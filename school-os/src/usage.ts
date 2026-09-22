// Turns API usage into dollars, logs every call to 04 System/costs.jsonl, and
// keeps a running total for the current run so jobs can stop at a budget.
import fs from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { DIRS } from "./config.js";
import { vaultPath } from "./vault.js";

// USD per million tokens: [input, output]. Cache reads cost 10% of input, cache writes 125%.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

let runTotal = 0;

export function costOf(model: string, u: Anthropic.Usage | Anthropic.Beta.BetaUsage): number {
  const [inP, outP] = PRICES[model] ?? [5, 25];
  const cacheRead = (u as { cache_read_input_tokens?: number | null }).cache_read_input_tokens ?? 0;
  const cacheWrite = (u as { cache_creation_input_tokens?: number | null }).cache_creation_input_tokens ?? 0;
  return (
    (u.input_tokens * inP + cacheRead * inP * 0.1 + cacheWrite * inP * 1.25 + u.output_tokens * outP) / 1_000_000
  );
}

export async function recordUsage(job: string, model: string, what: string, u: Anthropic.Usage | Anthropic.Beta.BetaUsage): Promise<number> {
  const cost = costOf(model, u);
  runTotal += cost;
  const line = JSON.stringify({
    time: new Date().toISOString(), job, model, what,
    input: u.input_tokens, output: u.output_tokens,
    cache_read: (u as { cache_read_input_tokens?: number | null }).cache_read_input_tokens ?? 0,
    cost: Number(cost.toFixed(4)),
  });
  const p = vaultPath(DIRS.system, "costs.jsonl");
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, line + "\n");
  return cost;
}

export const spentThisRun = () => runTotal;
export const money = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;
