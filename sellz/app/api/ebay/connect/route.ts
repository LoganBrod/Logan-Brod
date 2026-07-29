import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/ebay";

export const runtime = "nodejs";

/**
 * Kicks off the eBay login — full browser redirect, not a fetch.
 *
 * ?labels=1 additionally asks for the Logistics scope needed to buy postage.
 * That scope is opt-in rather than default because eBay only grants the
 * Logistics API to approved keysets, and requesting it unasked can fail the
 * whole consent — taking publishing and syncing down with it.
 */
export async function GET(req: NextRequest) {
  try {
    const includeLogistics = req.nextUrl.searchParams.get("labels") === "1";
    return NextResponse.redirect(getAuthorizeUrl({ includeLogistics }));
  } catch (err) {
    const message = encodeURIComponent(err instanceof Error ? err.message : "eBay connect failed");
    return NextResponse.redirect(new URL(`/brain?ebayError=${message}`, req.url));
  }
}
