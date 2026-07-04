import { NextRequest, NextResponse } from "next/server";
import { getPromoSettings, updatePromoSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPromoSettings());
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clean = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : undefined;

  const updated = updatePromoSettings({
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    headline: clean(body.headline, 60),
    code: clean(body.code, 40),
    subline: clean(body.subline, 80),
    accent: /^#?[0-9a-f]{6}$/i.test(body.accent ?? "")
      ? (body.accent.startsWith("#") ? body.accent : `#${body.accent}`)
      : undefined,
    durationSec:
      isFinite(Number(body.durationSec)) && Number(body.durationSec) > 0
        ? Math.min(10, Number(body.durationSec))
        : undefined,
  });
  return NextResponse.json(updated);
}
