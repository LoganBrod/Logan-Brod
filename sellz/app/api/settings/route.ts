import { NextRequest, NextResponse } from "next/server";
import { getSellerSettings, updateSellerSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...getSellerSettings(),
    hasBrain: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clean = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : undefined;
  const updated = updateSellerSettings({
    niche: clean(body.niche, 400),
    platforms: clean(body.platforms, 200),
    shipping: clean(body.shipping, 300),
    style: clean(body.style, 200),
  });
  return NextResponse.json({
    ...updated,
    hasBrain: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
