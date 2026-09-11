import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { MAX_MESSAGE, parseFeedback, readFeedback, recordFeedback } from "@/lib/feedback";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { redisConfigured } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * Same bearer auth as the query report, and for the same reason: the backlog
 * is other people's words, some of which will contain their email address.
 * ADMIN_SECRET falling back to CRON_SECRET; unset means closed.
 */
function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** GET /api/feedback — the backlog, newest first. Closed unless a secret is set. */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const items = await readFeedback(200);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/feedback — somebody found something.
 *
 * Deliberately open: no account, no cookie, no id. A bug report that requires
 * signing in is a bug report that doesn't get written, and the thing this
 * needs protecting from is volume rather than anonymity - which is what the
 * rate limit and the capped list are for.
 */
export async function POST(req: Request) {
  const burst = await rateLimit("feedback", clientIp(req), LIMITS.feedback);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "That's a lot of reports at once. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }
    );
  }

  if (!redisConfigured()) {
    return NextResponse.json(
      { error: "Reports aren't set up on this deployment yet." },
      { status: 501 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const entry = parseFeedback(body);
  if ("error" in entry) {
    return NextResponse.json({ error: entry.error }, { status: 400 });
  }

  const stored = await recordFeedback(entry);
  if (!stored) {
    return NextResponse.json(
      { error: "Couldn't file that just now. Try again in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { ok: true, maxMessage: MAX_MESSAGE },
    { headers: { "Cache-Control": "no-store" } }
  );
}
