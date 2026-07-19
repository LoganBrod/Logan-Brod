import { NextRequest, NextResponse } from "next/server";
import { getProductSettings, updateProductSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function capabilities() {
  return {
    hasBrain: Boolean(process.env.ANTHROPIC_API_KEY),
    hasAssets: Boolean(process.env.OPENAI_API_KEY),
  };
}

export async function GET() {
  return NextResponse.json({ ...getProductSettings(), ...capabilities() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clean = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : undefined;
  const updated = updateProductSettings({
    product: clean(body.product, 500),
    audience: clean(body.audience, 300),
    offer: clean(body.offer, 300),
    voice: clean(body.voice, 200),
  });
  return NextResponse.json({ ...updated, ...capabilities() });
}
