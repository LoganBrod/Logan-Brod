import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUsage, describeLimits, getPlan } from "@/lib/usage";
import { stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current plan and this month's usage, for the billing page. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const plan = await getPlan(userId);
  const listings = await checkUsage(userId, "listing");
  const research = await checkUsage(userId, "research");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true, usageResetAt: true },
  });

  const finite = (n: number) => (Number.isFinite(n) ? n : null);

  return NextResponse.json(
    {
      plan,
      limits: describeLimits(plan),
      listings: { used: listings.used, limit: finite(listings.limit) },
      research: { used: research.used, limit: finite(research.limit) },
      usageResetAt: user?.usageResetAt?.toISOString() ?? null,
      hasSubscription: Boolean(user?.stripeCustomerId),
      billingConfigured: stripeConfigured(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
