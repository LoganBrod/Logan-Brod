// What each plan allows, and what's been used this month.
//
// The limits exist to make the paid tier obvious, not to make the free one
// annoying. Everything free is a working taste of something that gets better
// with use: three closets a week is enough to see it change its mind about
// you, three judgements is enough to see that the answers are good. What's
// held back is the part that only makes sense as a service — searches that
// keep running, a wardrobe that accumulates.
//
// The cycle is a week rather than a month because the free tier's job is to
// bring somebody back, and "come back in three weeks" is the same sentence as
// "don't".
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
  free: { closets: 3, keeps: 2, judgements: 3, watches: 0, wardrobe: 0 },
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
 * Usage is counted per whole week rather than on a rolling window.
 *
 * A rolling window is fairer and impossible to explain; "three a week,
 * resets Monday" is something a person can hold in their head, which matters
 * more for a limit they're supposed to notice.
 *
 * It was a calendar month, and a month is the wrong unit for something people
 * are meeting for the first time. Somebody arrives, builds a clozet, and the
 * next thing the product says is "come back in three weeks" - which is the
 * same as saying don't. A week is short enough to be a reason to return.
 *
 * Weeks are anchored to Monday UTC. 1970-01-05 was a Monday, so whole weeks
 * since then is the index, and the Monday it names is the label - which makes
 * `usage:someone:2026-09-07:closets` legible in Redis rather than a number
 * nobody can date.
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_MONDAY_MS = 4 * 24 * 60 * 60 * 1000;

function weekStart(at: number): number {
  return FIRST_MONDAY_MS + Math.floor((at - FIRST_MONDAY_MS) / WEEK_MS) * WEEK_MS;
}

/**
 * Which cycle each meter runs on.
 *
 * `wardrobe` and `watches` are not periodic at all - they are caps on how many
 * things may exist at once, counted by looking at the things rather than by a
 * meter - so their entry here is never read. It is present so that adding a
 * meter forces a decision about its cycle instead of inheriting one.
 */
const CYCLE: Record<Meter, "week" | "month"> = {
  closets: "week",
  keeps: "week",
  judgements: "week",
  watches: "month",
  wardrobe: "month",
};

function period(meter: Meter, at = Date.now()): string {
  if (CYCLE[meter] === "month") {
    const now = new Date(at);
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return new Date(weekStart(at)).toISOString().slice(0, 10);
}

/** When this meter's window rolls over, so the UI can say when rather than just no. */
export function resetsAt(meter: Meter, at = Date.now()): string {
  if (CYCLE[meter] === "month") {
    const now = new Date(at);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  }
  return new Date(weekStart(at) + WEEK_MS).toISOString();
}

function meterKey(ownerId: string, meter: Meter): string {
  return `usage:${ownerId}:${period(meter)}:${meter}`;
}

/**
 * Long enough that the previous window is still readable while this one runs,
 * and no longer - a counter nobody will read again is storage being paid for.
 */
function meterTtlSeconds(meter: Meter): number {
  return CYCLE[meter] === "month" ? 62 * 24 * 60 * 60 : 21 * 24 * 60 * 60;
}

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
  /** When the window rolls over, so a refusal can say when rather than just no. */
  resets: string;
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
  if (!ownerId) return { allowed: false, used: limit, limit, plan, resets: resetsAt(meter) };

  const used = await usage(ownerId, meter);
  return { allowed: used < limit, used, limit, plan, resets: resetsAt(meter) };
}

/** Count one against the meter. Never throws — a lost count beats a lost run. */
export async function spend(ownerId: string | null, meter: Meter): Promise<void> {
  if (!ownerId || !redisConfigured()) return;
  try {
    await bump(meterKey(ownerId, meter), meterTtlSeconds(meter));
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
      return "That's your three clozets for this week - it resets Monday. Membership builds as many as you like.";
    case "keeps":
      return "Free keeps two clozets a week; it resets Monday. Membership keeps all of them.";
    case "judgements":
      return "That's three questions for this week - it resets Monday. Membership doesn't count them.";
    case "watches":
      return "Standing searches are part of membership — they keep looking after you close the tab.";
    case "wardrobe":
      return "Cataloguing what you own is part of membership.";
  }
}
