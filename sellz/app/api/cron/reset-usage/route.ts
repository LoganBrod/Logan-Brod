import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { resetMonthlyUsage } from "@/lib/usage";

export const runtime = "nodejs";

/**
 * Monthly allowance rollover. lib/usage.ts also rolls a seller's window over
 * lazily on read, so a missed run here delays the reset rather than locking
 * anyone out of what they are paying for.
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, reset: await resetMonthlyUsage() });
}
