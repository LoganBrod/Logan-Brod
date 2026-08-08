import { NextResponse } from "next/server";
import { analyzeStyle, type PhotoInput } from "@/lib/analyze";
import { describeApiError } from "@/lib/anthropic";
import { MAX_PHOTOS } from "@/lib/photos";
import { readTasteId, tasteMemo } from "@/lib/taste";

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

  try {
    // Never throws and returns null when there's no memory or no Redis, so this
    // can sit in the hot path without a guard.
    const memo = await tasteMemo(readTasteId(req.headers.get("cookie")));
    const profile = await analyzeStyle(photos, { min, max }, memo);
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: describeApiError(err) }, { status: 502 });
  }
}
