import { NextRequest, NextResponse } from "next/server";
import { getPhoto } from "@/lib/photos";
import { checkPhoto } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Instant coaching check, called right after each photo is taken — before
 * the seller has finished shooting the item, let alone submitted it for the
 * full pipeline. Fast enough to answer while they're still holding the item
 * up, so a bad shot gets retaken on the spot instead of surfacing as an
 * "uncertainties" note minutes later after they've already put it down.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const photoId = typeof body.photoId === "string" ? body.photoId : "";
  const shotsSoFar: string[] = Array.isArray(body.shotsSoFar)
    ? body.shotsSoFar.filter((s: unknown) => typeof s === "string").slice(0, 8)
    : [];

  if (!photoId) {
    return NextResponse.json({ error: "photoId is required" }, { status: 400 });
  }

  const photo = await getPhoto(photoId);
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  try {
    const result = await checkPhoto(
      {
        base64: photo.data.toString("base64"),
        mediaType: photo.contentType === "image/png" ? "image/png" : "image/jpeg",
      },
      shotsSoFar
    );
    return NextResponse.json(result);
  } catch {
    // A coaching tip is a nicety, not a blocker — never fail the upload over it.
    return NextResponse.json({ quickId: "", qualityWarning: "", missingShots: [] });
  }
}
