import { prisma } from "./prisma";

export type Plan = "free" | "pro" | "business";
export type MeteredAction = "listing" | "research";
export type PlanFeature = "proposals" | "autoPublish" | "autoRelist";

const UNLIMITED = Number.POSITIVE_INFINITY;

/**
 * What each plan includes.
 *
 * A "listing" is one full photo-to-draft analysis, which is not one model
 * call: it fans out to identify, comps, retail, refine, score and sometimes a
 * self-correction and an aspect gap-fill pass. The monthly caps are set
 * against that real cost, not against a single request.
 */
const LIMITS: Record<Plan, { listing: number; research: number; features: PlanFeature[] }> = {
  free: { listing: 10, research: 0, features: [] },
  pro: { listing: 100, research: 500, features: ["proposals", "autoPublish", "autoRelist"] },
  business: {
    listing: UNLIMITED,
    research: UNLIMITED,
    features: ["proposals", "autoPublish", "autoRelist"],
  },
};

function planOf(raw: string | null | undefined): Plan {
  return raw === "pro" || raw === "business" ? raw : "free";
}

const COUNTER: Record<MeteredAction, "listingsUsedThisMonth" | "aiCallsUsedThisMonth"> = {
  listing: "listingsUsedThisMonth",
  research: "aiCallsUsedThisMonth",
};

/**
 * Roll the counters over if the seller's month has elapsed.
 *
 * Done lazily on read as well as by the monthly cron: a cron that fails to
 * fire must not silently freeze someone out of the product they paid for.
 */
async function withFreshWindow(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      listingsUsedThisMonth: true,
      aiCallsUsedThisMonth: true,
      usageResetAt: true,
    },
  });
  if (!user) return null;

  const monthMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - user.usageResetAt.getTime() >= monthMs) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        listingsUsedThisMonth: 0,
        aiCallsUsedThisMonth: 0,
        usageResetAt: new Date(),
      },
      select: {
        plan: true,
        listingsUsedThisMonth: true,
        aiCallsUsedThisMonth: true,
        usageResetAt: true,
      },
    });
  }
  return user;
}

export interface UsageVerdict {
  allowed: boolean;
  used: number;
  remaining: number;
  /** Infinity on Business; callers should render "unlimited" rather than a number. */
  limit: number;
  plan: Plan;
}

/**
 * Whether this seller may perform one more metered action.
 *
 * Always reads the User row. The session JWT also carries a plan, but it goes
 * stale the moment a Stripe webhook changes the subscription — trusting it
 * here would let a cancelled subscriber keep spending platform AI budget until
 * they happened to sign in again.
 */
export async function checkUsage(userId: string, action: MeteredAction): Promise<UsageVerdict> {
  const user = await withFreshWindow(userId);
  if (!user) {
    return { allowed: false, used: 0, remaining: 0, limit: 0, plan: "free" };
  }
  const plan = planOf(user.plan);
  const limit = LIMITS[plan][action];
  const used = action === "listing" ? user.listingsUsedThisMonth : user.aiCallsUsedThisMonth;
  const remaining = limit === UNLIMITED ? UNLIMITED : Math.max(0, limit - used);
  return { allowed: used < limit, used, remaining, limit, plan };
}

export async function incrementUsage(userId: string, action: MeteredAction): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { [COUNTER[action]]: { increment: 1 } },
  });
}

/** Whether the seller's plan includes a gated feature. */
export async function planAllows(userId: string, feature: PlanFeature): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return LIMITS[planOf(user?.plan)].features.includes(feature);
}

export async function getPlan(userId: string): Promise<Plan> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return planOf(user?.plan);
}

/** Called by the monthly cron. The lazy rollover above is the safety net. */
export async function resetMonthlyUsage(): Promise<number> {
  const res = await prisma.user.updateMany({
    data: { listingsUsedThisMonth: 0, aiCallsUsedThisMonth: 0, usageResetAt: new Date() },
  });
  return res.count;
}

/** Plan limits for the billing page, without exposing Infinity to JSON. */
export function describeLimits(plan: Plan) {
  const l = LIMITS[plan];
  return {
    plan,
    listings: l.listing === UNLIMITED ? null : l.listing,
    research: l.research === UNLIMITED ? null : l.research,
    features: l.features,
  };
}
