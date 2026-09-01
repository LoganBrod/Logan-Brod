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
  curate: { limit: 40, windowSeconds: HOUR },
  judge: { limit: 30, windowSeconds: HOUR },
  /**
   * One marketplace fan-out per call, and SerpAPI's free tier is a hundred
   * searches a month. Unlimited, this was the cheapest way to empty that
   * quota from anywhere on the internet: thirty calls, no cookie needed.
   */
  shop: { limit: 30, windowSeconds: HOUR },
  /**
   * The image proxy. Not a model call, but an open proxy that fetches 3MB
   * from any public URL on request is still a thing to meter - a share card
   * draws a dozen images at most, so this is generous for the real use.
   */
  image: { limit: 120, windowSeconds: HOUR },
} as const;
