import { NextResponse } from "next/server";
import { getEbayTokens } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tokens = await getEbayTokens();
  const configured = Boolean(
    process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && process.env.EBAY_RUNAME
  );
  return NextResponse.json({
    configured,
    connected: Boolean(tokens),
    env: tokens?.env,
    connectedAt: tokens?.connectedAt,
  });
}
