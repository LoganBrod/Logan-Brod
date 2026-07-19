import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addAd, type Ad } from "@/lib/store";
import {
  experimentInstruction,
  generateConcepts,
  pickExperiment,
  scoreAd,
} from "@/lib/brain";
import { buildAssets } from "@/lib/assets";

export const runtime = "nodejs";
export const maxDuration = 600;

/** Generate new ad drafts from the playbook; kicks scoring + asset builds. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const format = body.format === "video" ? "video" : "image";
  const count = Math.max(1, Math.min(3, Number(body.count) || 1));
  const angle = typeof body.angle === "string" ? body.angle.slice(0, 500) : undefined;
  const buildNow = body.buildAssets !== false;

  try {
    const ads: Ad[] = [];
    for (let i = 0; i < count; i++) {
      const experimentId = pickExperiment();
      const [concept] = await generateConcepts(
        format,
        1,
        angle,
        experimentInstruction(experimentId)
      );
      const ad: Ad = {
        id: crypto.randomUUID().slice(0, 8),
        name: concept.name,
        platform: "meta",
        format,
        status: "draft",
        source: "generated",
        creative: concept.creative,
        experimentId,
        createdAt: new Date().toISOString(),
      };
      addAd(ad);
      void scoreAd(ad.id);
      if (buildNow && process.env.OPENAI_API_KEY) void buildAssets(ad.id);
      ads.push(ad);
    }
    return NextResponse.json(ads);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 502 }
    );
  }
}
