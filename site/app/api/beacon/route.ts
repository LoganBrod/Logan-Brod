import { NextResponse } from "next/server";
import { normaliseCampaign, normalisePath, normaliseSource, recordHit, visitorKey } from "@/lib/analytics";
import { isEvent } from "@/lib/analyticsEvents";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { readTasteId } from "@/lib/taste";

export const dynamic = "force-dynamic";

/**
 * POST /api/beacon — one pageview, or one step of the funnel.
 *
 * Answers 204 to everything, including the things it refuses. A beacon is
 * fire-and-forget by construction: `sendBeacon` cannot read a response and the
 * page has nothing to do with an error anyway, so a body would be bytes spent
 * on nobody. It also means this endpoint tells a prober nothing about what it
 * accepted, which is the small side benefit.
 *
 * Nothing here is trusted. The path, the referrer and the campaign all arrive
 * from the browser and are all collapsed onto fixed sets before they become
 * Redis field names — see `lib/analytics.ts` for why that is the load-bearing
 * part rather than a tidiness measure.
 */
export async function POST(req: Request) {
  const no = () => new NextResponse(null, { status: 204 });

  // A public write endpoint gets a ceiling like every other public write
  // endpoint. Generous, because a real session is a dozen of these.
  const burst = await rateLimit("beacon", clientIp(req), LIMITS.beacon);
  if (!burst.allowed) return no();

  let body: { path?: unknown; event?: unknown; ref?: unknown; campaign?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return no();
  }

  const event = isEvent(body.event) ? body.event : undefined;
  const isView = typeof body.path === "string";
  if (!event && !isView) return no();

  // Counted from a daily rotating hash rather than a cookie, so somebody who
  // has only ever seen the marketing page is still a person. See visitorKey.
  const visitor = visitorKey(clientIp(req), req.headers.get("user-agent"));

  // The Clozet cookie is httpOnly and only ever set by the product, so
  // carrying one means this is not their first time here. It is read for that
  // one bit and nothing else.
  const returning = Boolean(readTasteId(req.headers.get("cookie")));

  let self: string | null = null;
  try {
    self = new URL(req.url).hostname;
  } catch {
    self = null;
  }

  const source = isView ? normaliseSource(body.ref, self) : undefined;

  await recordHit({
    ...(isView ? { path: normalisePath(body.path) } : {}),
    ...(event ? { event } : {}),
    // "internal" means one page of ours to another, which is not an arrival.
    ...(source && source !== "internal" ? { source } : {}),
    campaign: normaliseCampaign(body.campaign),
    visitor,
    returning,
  });

  return no();
}
