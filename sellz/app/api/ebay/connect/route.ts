import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/ebay";
import { currentUserId } from "@/lib/auth";
import { encodeState } from "@/lib/oauthState";

export const runtime = "nodejs";

/**
 * Kicks off the eBay login — a full browser redirect, not a fetch.
 *
 * The signed-in user is baked into the signed `state` parameter here, which is
 * how the callback knows whose account to attach the tokens to.
 *
 * ?labels=1 additionally asks for the Logistics scope needed to buy postage.
 * That scope is opt-in rather than default because eBay only grants the
 * Logistics API to approved keysets, and requesting it unasked can fail the
 * whole consent — taking publishing and syncing down with it.
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.redirect(new URL("/login?next=/brain", req.url));
  }
  try {
    const includeLogistics = req.nextUrl.searchParams.get("labels") === "1";
    const state = encodeState(userId, { labels: includeLogistics });
    return NextResponse.redirect(getAuthorizeUrl({ includeLogistics, state }));
  } catch (err) {
    const message = encodeURIComponent(err instanceof Error ? err.message : "eBay connect failed");
    return NextResponse.redirect(new URL(`/brain?ebayError=${message}`, req.url));
  }
}
