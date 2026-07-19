import { NextRequest, NextResponse } from "next/server";
import { getAd } from "@/lib/store";
import { buildAssets } from "@/lib/assets";

export const runtime = "nodejs";

/** (Re)build the ad's generated assets — fire-and-forget, status on the record. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ad = getAd(params.id);
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Asset generation needs OPENAI_API_KEY set in .env.local" },
      { status: 400 }
    );
  }
  if (ad.assets?.status === "generating") {
    return NextResponse.json({ error: "Already generating" }, { status: 409 });
  }
  void buildAssets(ad.id);
  return NextResponse.json(getAd(ad.id));
}
