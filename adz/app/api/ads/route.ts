import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addAd, listAds, type Ad } from "@/lib/store";
import { pickExperiment, scoreAd } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listAds());
}

/** Import an existing ad (usually with its historical metrics). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const s = (v: unknown, max: number, fallback = "") =>
    typeof v === "string" ? v.trim().slice(0, max) : fallback;

  const name = s(body.name, 100);
  const headline = s(body.headline, 200);
  if (!name || !headline) {
    return NextResponse.json(
      { error: "Name and headline are required" },
      { status: 400 }
    );
  }

  const ad: Ad = {
    id: crypto.randomUUID().slice(0, 8),
    name,
    platform: ["meta", "tiktok", "x", "google", "other"].includes(body.platform)
      ? body.platform
      : "other",
    format: body.format === "video" ? "video" : "image",
    status: "ended",
    source: "imported",
    creative: {
      headline,
      primaryText: s(body.primaryText, 2000),
      cta: s(body.cta, 60, "Learn more"),
      visualDescription: s(body.visualDescription, 1000),
    },
    experimentId: "control",
    createdAt: new Date().toISOString(),
  };

  const n = (v: unknown) => (isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  if (body.metrics && typeof body.metrics === "object") {
    ad.metrics = {
      impressions: n(body.metrics.impressions),
      clicks: n(body.metrics.clicks),
      spend: n(body.metrics.spend),
      purchases: n(body.metrics.purchases),
      revenue: n(body.metrics.revenue),
      updatedAt: new Date().toISOString(),
    };
  }

  addAd(ad);
  // Imported ads with history don't need a prediction; drafts do
  if (!ad.metrics) {
    ad.experimentId = pickExperiment();
    void scoreAd(ad.id);
  }
  return NextResponse.json(ad);
}
