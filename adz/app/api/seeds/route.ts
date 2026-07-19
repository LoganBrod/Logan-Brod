import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addSeedAd, deleteSeedAd, listSeedAds } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listSeedAds());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 600) : "";
  if (description.length < 10) {
    return NextResponse.json(
      { error: "Describe the ad — the hook, the visual, the offer, why it worked" },
      { status: 400 }
    );
  }
  addSeedAd({
    id: crypto.randomUUID().slice(0, 8),
    description,
    source: typeof body.source === "string" ? body.source.trim().slice(0, 300) : undefined,
    stats: typeof body.stats === "string" ? body.stats.trim().slice(0, 100) : undefined,
    addedAt: new Date().toISOString(),
  });
  return NextResponse.json(listSeedAds());
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  deleteSeedAd(id);
  return NextResponse.json(listSeedAds());
}
