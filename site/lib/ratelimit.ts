// A ceiling on the endpoints that spend money.
//
// The quota system meters against a cookie, which is the right tool for telling
// an honest person they have used their free clozet. It is the wrong tool for
// stopping abuse, because the attacker's move is simply not to send a cookie:
// every request then looks like a brand new visitor with a full allowance.
//
// So this counts against the network address instead. It is coarse and it is
// not perfect — a shared office or a mobile carrier NAT puts many people behind
// one address — but it is the only identifier the caller cannot mint for
// themselves, and the routes it guards cost around $0.28 to $0.59 each.

import { bump, getJson, redisConfigured } from "./redis";

export interface Limited {
  allowed: boolean;
  used: number;
  limit: number;
  /** Seconds until the window rolls over, for a Retry-After header. */
  retryAfter: number;
}

/**
 * The caller's address, as far as it can be trusted.
 *
 * Takes the **last** entry of `x-forwarded-for`, not the first. A client can
 * send their own header and a proxy appends to it, so the leftmost value is
 * whatever the caller claimed and the rightmost is what our own edge actually
 * saw. Reading the left is the standard way this control gets bypassed.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.headers.get("x-real-ip") ?? null;
}

/** Windows are fixed rather than sliding: one counter, one expiry, no set to scan. */
function windowKey(bucket: string, id: string, windowSeconds: number): string {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  return `rl:${bucket}:${id}:${window}`;
}

/**
 * Count one request and say whether it is allowed.
 *
 * On the failure mode, deliberately: if Redis is *configured* and then errors,
 * this denies. An expensive endpoint that falls open the moment its own limiter
 * breaks is not a limiter — the outage and the abuse arrive together, and being
 * briefly unavailable is a smaller problem than an unbounded bill. If Redis is
 * not configured at all, that is a machine without any of this set up, so it
 * allows and the caller is expected to be a developer.
 */
export async function rateLimit(
  bucket: string,
  id: string | null,
  { limit, windowSeconds }: { limit: number; windowSeconds: number }
): Promise<Limited> {
  const elapsed = Math.floor(Date.now() / 1000) % windowSeconds;
  const retryAfter = windowSeconds - elapsed;

  // No address to count against is itself a reason to refuse: every caller we
  // can identify gets a share, and one we cannot gets nothing.
  if (!id) return { allowed: false, used: 0, limit, retryAfter };

  if (!redisConfigured()) return { allowed: true, used: 0, limit, retryAfter };

  try {
    const used = await bump(windowKey(bucket, id, windowSeconds), windowSeconds);
    return { allowed: used <= limit, used, limit, retryAfter };
  } catch {
    return { allowed: false, used: limit, limit, retryAfter };
  }
}

/** Read a window without spending against it — for tests and for diagnostics. */
export async function rateLimitUsed(
  bucket: string,
  id: string,
  windowSeconds: number
): Promise<number> {
  if (!redisConfigured()) return 0;
  try {
    return Number((await getJson<number>(windowKey(bucket, id, windowSeconds))) ?? 0);
  } catch {
    return 0;
  }
}

const HOUR = 60 * 60;

/**
 * What each expensive route allows from one address in an hour.
 *
 * A real run is one analyze followed by up to six curate calls, so six runs an
 * hour is far more than anyone builds by hand and still bounds the worst hour a
 * single address can cost to a few dollars rather than to whatever their patience
 * allows.
 */
export const LIMITS = {
  analyze: { limit: 6, windowSeconds: HOUR },
  /**
   * The second search, when a run came back thin. Its own bucket, the same
   * size as analyze: it used to share analyze's, and under one shared address
   * - an office, a dorm, a carrier - the rejected attempts of other people
   * filled the bucket and a run that had legitimately got through was denied
   * its second search. The spend stays bounded; it is just no longer bounded
   * by strangers.
   */
  requery: { limit: 6, windowSeconds: HOUR },
  curate: { limit: 40, windowSeconds: HOUR },
  judge: { limit: 30, windowSeconds: HOUR },
  /**
   * One marketplace fan-out per call, and SerpAPI's free tier is a hundred
   * searches a month. Unlimited, this was the cheapest way to empty that
   * quota from anywhere on the internet: thirty calls, no cookie needed.
   */
  shop: { limit: 30, windowSeconds: HOUR },
  /**
   * A brand sizing lookup: a web search, up to three page fetches and a
   * high-effort pass over all of them, which makes it the most expensive
   * single call on the site. It was metered but not limited, and a meter is
   * not a limit - the meter counts against a cookie, and the attacker's move
   * is to send no cookie and be minted a fresh allowance every request. Ten
   * an hour is more brands than anyone checks in a sitting.
   */
  fit: { limit: 10, windowSeconds: HOUR },
  /**
   * Reading photos into the owned wardrobe, and building outfits from it.
   * Members only, so an attacker needs an account first - but an account is
   * free to ask for and the outfit pass reads a whole wardrobe, so it is
   * bounded here rather than trusted to the plan.
   */
  wardrobe: { limit: 20, windowSeconds: HOUR },
  /**
   * Saving a closet. Not a model call - this one is about Redis, where every
   * save allocates a key with a long TTL. A person builds a closet, saves it,
   * and comes back; twenty an hour is far past that and still a ceiling.
   */
  save: { limit: 20, windowSeconds: HOUR },
  /**
   * The analytics beacon. Cheap per call and public, which is exactly the
   * combination that needs a number on it: a real session is a dozen of
   * these, and without a ceiling it is a free way to run up Redis commands
   * and make the numbers say whatever somebody wants them to say.
   */
  beacon: { limit: 300, windowSeconds: HOUR },
  /**
   * Bug reports and suggestions. Nothing here costs a model call, but it is an
   * unauthenticated write that a stranger can reach, so it gets a ceiling like
   * everything else a stranger can reach. Ten an hour is more than anyone with
   * something to say, and less than anyone with a script.
   */
  feedback: { limit: 10, windowSeconds: HOUR },
  /**
   * The image proxy. Not a model call, but an open proxy that fetches 3MB
   * from any public URL on request is still a thing to meter - a share card
   * draws a dozen images at most, so this is generous for the real use.
   */
  image: { limit: 120, windowSeconds: HOUR },
} as const;
