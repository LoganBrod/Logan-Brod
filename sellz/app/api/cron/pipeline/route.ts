import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized, tenantsWithEbay } from "@/lib/cron";
import { runPipelineForUser, markStale, type PipelineResult } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * The maintenance pass, run every few hours.
 *
 * Sync, score, comps, diagnose and playbook re-analysis used to be five
 * buttons. This runs them on a schedule so a listing gets looked after
 * whether or not the seller thinks to open the app — which matters most for
 * the sellers least likely to.
 *
 * Applying changes to live eBay listings is deliberately NOT here. That stays
 * in /api/cron/research, which is gated on each seller's automation settings.
 * This job only reads from eBay and writes to our own store, so a bug here
 * cannot reprice or retitle somebody's live listing.
 *
 * Suggested schedule: every 6 hours, offset from the nightly research sweep so
 * the two don't contend for the same eBay rate limit.
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await tenantsWithEbay();

  /**
   * Split the function's time budget across tenants rather than giving each a
   * fixed slice: with three sellers each gets a generous share, and with fifty
   * everyone still gets a turn instead of the tail being cut off entirely.
   * Floored so a large tenant list doesn't reduce each share to uselessness.
   */
  const budgetMs = Math.max(30_000, Math.floor(600_000 / Math.max(1, tenants.length)));

  const results: PipelineResult[] = [];
  for (const userId of tenants) {
    try {
      const result = await runPipelineForUser(userId, budgetMs);
      // After the passes above, so a listing that just synced as sold isn't
      // marked stale on the same run.
      result.staled = await markStale(userId);
      results.push(result);
    } catch (err) {
      // One tenant's failure must never stop the sweep.
      results.push({
        userId,
        scored: 0,
        comped: 0,
        diagnosed: 0,
        playbook: false,
        errors: [err instanceof Error ? err.message : "pipeline failed"],
      });
    }
  }

  return NextResponse.json({
    ok: true,
    tenants: tenants.length,
    ranAt: new Date().toISOString(),
    totals: {
      scored: results.reduce((n, r) => n + r.scored, 0),
      comped: results.reduce((n, r) => n + r.comped, 0),
      diagnosed: results.reduce((n, r) => n + r.diagnosed, 0),
      playbooks: results.filter((r) => r.playbook).length,
    },
    results,
  });
}
