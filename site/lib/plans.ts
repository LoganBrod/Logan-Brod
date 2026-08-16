// What each plan allows, and what's been used this month.
//
// The limits exist to make the paid tier obvious, not to make the free one
// annoying. Everything free is a working taste of something that gets better
// with use: one closet a month is a real closet, three judgements is enough to
// see that the answers are good. What's held back is the part that only makes
// sense as a service — searches that keep running, a wardrobe that accumulates.
//
// Taking money is deliberately not in here. The plan is a field on the account,
// and `grantPlan` is the entire integration surface: a Stripe webhook, an admin
// action, or the env var below can all set it without anything else changing.

import { bump, getJson, redisConfigured, setJson } from "./redis";
import { readUser, type User } from "./accounts";

export type Plan = "free" | "member";

export interface Limits {
  /** Full closet runs per month. */
  closets: number;
  /** Closets that can be kept permanently. */
  keeps: number;
  /** Single-piece judgements per month. */
  judgements: number;
  /** Standing searches that keep running after you close the tab. */
  watches: number;
  /** Garments in the owned wardrobe. */
  wardrobe: number;
}

const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const LIMITS: Record<Plan, Limits> = {
  free: { closets: 1, keeps: 1, judgements: 3, watches: 0, wardrobe: 0 },
  member: {
    closets: UNLIMITED,
    keeps: UNLIMITED,
    judgements: UNLIMITED,
    watches: 10,
    wardrobe: 200,
  },
};

/**
 * Members get a lot but not infinity on the two things that cost real money
 * every day. Ten standing searches is more than anyone maintains; two hundred
 * garments is a wardrobe nobody has.
 */
export type Meter = keyof Limits;

export function limitsFor(plan: Plan): Limits {
  return LIMITS[plan] ?? LIMITS.free;
}

export function isUnlimited(value: number): boolean {
  return value >= UNLIMITED;
}

/**
 * Who is a member.
 *
 * Until there's a payment provider, membership is granted rather than bought:
 * `MEMBER_EMAILS` is a comma-separated list, which covers you, anyone testing,
 * and the first handful of people you want to give it to. When Stripe lands,
 * its webhook calls `grantPlan` and this stays as the override.
 */
function grantedByEnv(email: string): boolean {
  const list = process.env.MEMBER_EMAILS ?? "";
  return list
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

export function planFor(user: User | null): Plan {
  if (!user) return "free";
  if (user.plan === "member") return "member";
  return grantedByEnv(user.email) ? "member" : "free";
}

/** Set a plan on an account. The whole integration surface for billing. */
export async function grantPlan(userId: string, plan: Plan): Promise<void> {
  const user = await readUser(userId);
  if (!user) throw new Error("No such account.");
  await setJson(`user:${user.id}`, { ...user, plan });
}

// ------------------------------------------------------------------ metering

/**
 * Usage is counted per calendar month rather than on a rolling window.
 *
 * A rolling window is fairer and impossible to explain; "three a month,
 * resets on the 1st" is something a person can hold in their head, which
 * matters more for a limit they're supposed to notice.
 */
function period(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function meterKey(ownerId: string, meter: Meter): string {
  return `usage:${ownerId}:${period()}:${meter}`;
}

/** Two months, so last month's number is still readable while this one runs. */
const METER_TTL_SECONDS = 62 * 24 * 60 * 60;

export async function usage(ownerId: string | null, meter: Meter): Promise<number> {
  if (!ownerId || !redisConfigured()) return 0;
  try {
    return Number((await getJson<number>(meterKey(ownerId, meter))) ?? 0);
  } catch {
    return 0;
  }
}

export interface Allowance {
  allowed: boolean;
  used: number;
  limit: number;
  plan: Plan;
}

/**
 * Whether one more is allowed, without spending it.
 *
 * Read-only on purpose: this is what the UI asks so it can grey a button and
 * explain why. Spending happens in `spend`, after the work has succeeded — a
 * run that fails on a busy API shouldn't cost someone their month.
 */
export async function allowance(
  ownerId: string | null,
  plan: Plan,
  meter: Meter
): Promise<Allowance> {
  const limit = limitsFor(plan)[meter];

  // No id means we could not work out who is asking, and an unmeasurable
  // request used to be an unlimited one: `usage(null)` returned 0, so the
  // comparison below always passed. Deleting one cookie reset every allowance
  // on the site. A caller with no identity now gets nothing — routes that serve
  // anonymous people are expected to mint an id first (see `identify`), which
  // is a deliberate act rather than an accident of a missing header.
  if (!ownerId) return { allowed: false, used: limit, limit, plan };

  const used = await usage(ownerId, meter);
  return { allowed: used < limit, used, limit, plan };
}

/** Count one against the meter. Never throws — a lost count beats a lost run. */
export async function spend(ownerId: string | null, meter: Meter): Promise<void> {
  if (!ownerId || !redisConfigured()) return;
  try {
    await bump(meterKey(ownerId, meter), METER_TTL_SECONDS);
  } catch {
    // Metering is bookkeeping. It must never be the reason something fails.
  }
}

/** The sentence shown when someone hits a limit. Says what to do, not just no. */
export function limitMessage(meter: Meter, plan: Plan): string {
  if (plan === "member") {
    const cap = limitsFor(plan)[meter];
    return meter === "watches"
      ? `You're watching ${cap} searches already. Stop one to start another.`
      : `You've reached the ${cap} limit on this. Get in touch if you need more.`;
  }

  switch (meter) {
    case "closets":
      return "That's your clozet for this month. Membership builds as many as you like.";
    case "keeps":
      return "Free keeps one clozet permanently. Membership keeps all of them.";
    case "judgements":
      return "That's three pieces judged this month. Membership doesn't count them.";
    case "watches":
      return "Standing searches are part of membership — they keep looking after you close the tab.";
    case "wardrobe":
      return "Cataloguing what you own is part of membership.";
  }
}
