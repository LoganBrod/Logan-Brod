import { NextResponse } from "next/server";
import { analyzeStyle, type PhotoInput } from "@/lib/analyze";
import { describeApiError } from "@/lib/anthropic";
import { MAX_PHOTOS } from "@/lib/photos";
import { tasteMemo } from "@/lib/taste";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { allowance, limitMessage, spend } from "@/lib/plans";
import { tasteCookie } from "@/lib/taste";
import { identify } from "@/lib/viewer";
import { readOwned, renderOwned } from "@/lib/wardrobeOwned";

export const dynamic = "force-dynamic";
// Vision over several photos at high effort is slow; the platform default of
// 10s would cut it off.
export const maxDuration = 120;

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// The API ceiling is 32MB; stopping short of it gives a clear error instead of
// an opaque upstream rejection.
const MAX_TOTAL_BASE64_CHARS = 16 * 1024 * 1024;

interface AnalyzeBody {
  photos?: unknown;
  min?: unknown;
  max?: unknown;
}

function parsePhotos(raw: unknown): PhotoInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is PhotoInput => {
      if (!entry || typeof entry !== "object") return false;
      const photo = entry as Record<string, unknown>;
      return (
        typeof photo.data === "string" &&
        photo.data.length > 0 &&
        typeof photo.mediaType === "string" &&
        ALLOWED_MEDIA_TYPES.includes(photo.mediaType)
      );
    })
    .slice(0, MAX_PHOTOS);
}

/** A response's headers, carrying the browser id back when one was just minted. */
function mint(id: string | null): Record<string, string> {
  return id ? { "Set-Cookie": tasteCookie(id) } : {};
}

export async function POST(req: Request) {
  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const photos = parsePhotos(body.photos);
  const min = Number(body.min);
  const max = Number(body.max);

  if (!photos.length) {
    return NextResponse.json(
      { error: "photos must be a non-empty array of { data, mediaType }." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    return NextResponse.json(
      { error: "min and max must be numbers with 0 <= min < max." },
      { status: 400 }
    );
  }

  const totalChars = photos.reduce((sum, photo) => sum + photo.data.length, 0);
  if (totalChars > MAX_TOTAL_BASE64_CHARS) {
    return NextResponse.json(
      { error: "Those photos are too large all together. Try fewer, or smaller ones." },
      { status: 413 }
    );
  }

  /*
   * Everything below the model call is free; the model call is not. This route
   * was reachable with no cookie, no session and no origin check, and it is the
   * first and most expensive step of a run — so a loop against it spent real
   * money at machine speed with nothing in the way.
   *
   * Two gates, in this order, both before a single token is bought:
   *
   *   1. The address. This is the one that actually stops abuse, because it is
   *      the only identifier the caller cannot mint for themselves.
   *   2. The person's own quota, which is what tells an honest visitor they
   *      have used their clozet for the month.
   */
  const ip = clientIp(req);
  const burst = await rateLimit("analyze", ip, LIMITS.analyze);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "That's a lot of clozets in one hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }
    );
  }

  const viewer = await identify(req);
  const room = await allowance(viewer.id, viewer.plan, "closets");
  if (!room.allowed) {
    return NextResponse.json(
      { error: limitMessage("closets", viewer.plan), plan: viewer.plan },
      { status: 402, headers: mint(viewer.mint) }
    );
  }

  try {
    const [memo, owned] = await Promise.all([
      tasteMemo(viewer.tasteId),
      readOwned(viewer.owner),
    ]);
    const profile = await analyzeStyle(photos, { min, max }, memo, renderOwned(owned));

    // Spent here rather than on save. The money leaves at the model call, so
    // that is where the count has to happen — metering at save time meant a run
    // abandoned before saving was billed to us and to nobody's allowance.
    await spend(viewer.id, "closets");

    return NextResponse.json(
      { profile },
      { headers: { "Cache-Control": "no-store", ...mint(viewer.mint) } }
    );
  } catch (err) {
    // The id is written back even on a failure. Nothing was spent, but the
    // person should stay the same person: without this, a first run that errors
    // leaves them with no cookie and their retry is metered as a stranger.
    return NextResponse.json(
      { error: describeApiError(err) },
      { status: 502, headers: mint(viewer.mint) }
    );
  }
}
