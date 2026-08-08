import { NextResponse } from "next/server";
import { analyzeStyle } from "@/lib/analyze";

export const dynamic = "force-dynamic";
// Vision over several photos at high effort is slow; the platform default of
// 10s would cut it off.
export const maxDuration = 120;

const MAX_PHOTOS = 6;

interface AnalyzeBody {
  photoUrls?: unknown;
  min?: unknown;
  max?: unknown;
}

export async function POST(req: Request) {
  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const photoUrls = Array.isArray(body.photoUrls)
    ? body.photoUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const min = Number(body.min);
  const max = Number(body.max);

  if (!photoUrls.length) {
    return NextResponse.json({ error: "photoUrls must be a non-empty array." }, { status: 400 });
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    return NextResponse.json(
      { error: "min and max must be numbers with 0 <= min < max." },
      { status: 400 }
    );
  }

  try {
    const profile = await analyzeStyle(photoUrls.slice(0, MAX_PHOTOS), { min, max });
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
