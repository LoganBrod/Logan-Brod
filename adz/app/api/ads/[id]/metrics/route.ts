import { NextRequest, NextResponse } from "next/server";
import { getAd, updateAd } from "@/lib/store";

export const runtime = "nodejs";

/** Record real performance numbers for an ad. */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ad = getAd(params.id);
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const n = (v: unknown) => (isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  updateAd(ad.id, {
    metrics: {
      impressions: n(body.impressions),
      clicks: n(body.clicks),
      spend: n(body.spend),
      purchases: n(body.purchases),
      revenue: n(body.revenue),
      updatedAt: new Date().toISOString(),
    },
  });
  return NextResponse.json(getAd(ad.id));
}
