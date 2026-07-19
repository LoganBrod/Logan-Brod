import { NextRequest, NextResponse } from "next/server";
import { getAd } from "@/lib/store";
import { scoreAd } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ad = getAd(params.id);
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const score = await scoreAd(ad.id);
    if (!score) {
      return NextResponse.json(
        { error: "Scoring needs ANTHROPIC_API_KEY set in .env.local" },
        { status: 400 }
      );
    }
    return NextResponse.json(getAd(ad.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scoring failed" },
      { status: 502 }
    );
  }
}
