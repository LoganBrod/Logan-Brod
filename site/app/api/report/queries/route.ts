import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { readYieldReport } from "@/lib/yield";

export const dynamic = "force-dynamic";

/**
 * Bearer auth for the read-only reports.
 *
 * ADMIN_SECRET, falling back to CRON_SECRET so one secret can serve both.
 * Unset means closed - the same posture as the cron route, because a report
 * that lists every search the app has ever run is not public information.
 * Compared in constant time, like the cron secret and for the same reason.
 */
function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * GET /api/report/queries — which searches turn into pieces people keep.
 *
 * The first measurement this app has of whether its recommendations are any
 * good. Every row follows one query from the marketplace to the rail to a
 * person's reaction; the ranking puts proven searches first and starved ones
 * last. `scripts/query-report.mjs` prints it as a table.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const report = await readYieldReport();
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
