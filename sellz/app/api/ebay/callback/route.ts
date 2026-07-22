import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/ebay";

export const runtime = "nodejs";

/** eBay redirects here after the user logs in and grants consent. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/brain?ebayError=No+authorization+code+returned", req.url));
  }
  try {
    await exchangeCodeForTokens(code);
    return NextResponse.redirect(new URL("/brain?ebay=connected", req.url));
  } catch (err) {
    const message = encodeURIComponent(err instanceof Error ? err.message : "eBay connection failed");
    return NextResponse.redirect(new URL(`/brain?ebayError=${message}`, req.url));
  }
}
