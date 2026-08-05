import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getEbayTokens } from "@/lib/store";
import { syncEbayListings } from "@/lib/ebaySync";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The "Sync from eBay" button.
 *
 * The reconciliation itself lives in lib/ebaySync so the scheduled pipeline
 * runs exactly the same code — this route is now only session auth, the eBay
 * connection check, and error shaping.
 */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (!(await getEbayTokens(userId))) {
    return NextResponse.json({ error: "Connect your eBay account first" }, { status: 400 });
  }

  try {
    const result = await syncEbayListings(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't reach eBay" },
      { status: 502 }
    );
  }
}
