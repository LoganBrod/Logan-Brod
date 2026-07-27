import { NextResponse } from "next/server";
import { checkPublishReadiness } from "@/lib/ebay";
import { getEbayTokens } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Can this account actually publish listings, and if not, what's missing? */
export async function GET() {
  if (!(await getEbayTokens())) {
    return NextResponse.json(
      { connected: false, ready: false, missing: ["eBay account not connected"] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const readiness = await checkPublishReadiness();
    return NextResponse.json(
      { connected: true, ...readiness },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        connected: true,
        ready: false,
        missing: [err instanceof Error ? err.message : "Couldn't check eBay account setup"],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
