import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/ebay";

export const runtime = "nodejs";

/** Kicks off the eBay login — full browser redirect, not a fetch. */
export async function GET(req: NextRequest) {
  try {
    return NextResponse.redirect(getAuthorizeUrl());
  } catch (err) {
    const message = encodeURIComponent(err instanceof Error ? err.message : "eBay connect failed");
    return NextResponse.redirect(new URL(`/brain?ebayError=${message}`, req.url));
  }
}
