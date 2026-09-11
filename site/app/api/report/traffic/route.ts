import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { readTraffic } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * The same bearer auth as the query report. ADMIN_SECRET, falling back to
 * CRON_SECRET; unset means closed. Compared in constant time, so the secret
 * cannot be guessed a byte at a time off the response latency.
 */
function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** GET /api/report/traffic?days=30 — who showed up, from where, how far they got. */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const report = await readTraffic(Number.isFinite(days) ? days : 30);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
