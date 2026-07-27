import { NextResponse } from "next/server";
import { getEbayTokens } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const tokens = await getEbayTokens();
  const configured = Boolean(
    process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && process.env.EBAY_RUNAME
  );
  return NextResponse.json(
    {
      configured,
      connected: Boolean(tokens),
      env: tokens?.env,
      connectedAt: tokens?.connectedAt,
    },
    {
      // Without this the CDN/browser can serve a stale "connected" response
      // after disconnecting, making the disconnect look like it failed.
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Netlify-CDN-Cache-Control": "no-store",
      },
    }
  );
}
