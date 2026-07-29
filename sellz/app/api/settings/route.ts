import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import {
  getSellerSettings,
  updateSellerSettings,
  DEFAULT_AUTO_RULES,
  type AutoApplyRules,
  type SellerSettings,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  return NextResponse.json({
    ...(await getSellerSettings(userId)),
    hasBrain: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}

const AUTOMATION_LEVELS: SellerSettings["automationLevel"][] = ["manual", "semi", "auto"];

/** Clamp a number from the client, falling back when it isn't one. */
function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Automation rules decide what gets pushed to live eBay listings without the
 * seller looking at it, so every field is validated rather than trusted — a
 * bad value here spends real money.
 */
function parseRules(v: unknown, current: AutoApplyRules): AutoApplyRules | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const bool = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback);
  // Omitted fields keep what is already set, so a partial update can never
  // silently loosen a limit the seller deliberately tightened.
  return {
    maxPriceDrop: num(r.maxPriceDrop, 0, 1000, current.maxPriceDrop),
    maxPriceDropPct: num(r.maxPriceDropPct, 0, 100, current.maxPriceDropPct),
    autoRetitle: bool(r.autoRetitle, current.autoRetitle),
    autoRelist: bool(r.autoRelist, current.autoRelist),
    requireReviewForRewrite: bool(r.requireReviewForRewrite, current.requireReviewForRewrite),
    minConfidence: num(r.minConfidence, 0, 100, current.minConfidence),
  };
}

export async function PUT(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const clean = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : undefined;
  const currentRules = (await getSellerSettings(userId)).autoApplyRules ?? DEFAULT_AUTO_RULES;
  const updated = await updateSellerSettings(userId, {
    niche: clean(body.niche, 400),
    platforms: clean(body.platforms, 200),
    shipping: clean(body.shipping, 300),
    style: clean(body.style, 200),
    automationLevel: AUTOMATION_LEVELS.includes(body.automationLevel)
      ? body.automationLevel
      : undefined,
    autoApplyRules: parseRules(body.autoApplyRules, currentRules),
    relistEnabled: typeof body.relistEnabled === "boolean" ? body.relistEnabled : undefined,
    defaultRelistDays:
      body.defaultRelistDays === undefined
        ? undefined
        : num(body.defaultRelistDays, 1, 90, 10),
    defaultPackageWeightOz:
      body.defaultPackageWeightOz === undefined
        ? undefined
        : num(body.defaultPackageWeightOz, 0.1, 4000, 3),
    autoPublishThreshold:
      body.autoPublishThreshold === undefined
        ? undefined
        : num(body.autoPublishThreshold, 0, 100, 0),
    autoAcceptOfferPct:
      body.autoAcceptOfferPct === undefined
        ? undefined
        : num(body.autoAcceptOfferPct, 0, 100, 0),
  });
  return NextResponse.json({
    ...updated,
    hasBrain: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
