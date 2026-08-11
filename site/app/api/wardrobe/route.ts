import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { describeApiError } from "@/lib/anthropic";
import { limitMessage, limitsFor } from "@/lib/plans";
import { redisConfigured } from "@/lib/redis";
import { tasteMemo } from "@/lib/taste";
import { readViewer } from "@/lib/viewer";
import {
  buildOutfits,
  readOwned,
  readWardrobePhotos,
  removeOwned,
  writeOwned,
  type OwnedGarment,
} from "@/lib/wardrobeOwned";

export const dynamic = "force-dynamic";
// Reading several photos at once, or building outfits across a whole wardrobe.
export const maxDuration = 120;

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PHOTOS_PER_BATCH = 6;
const MAX_TOTAL_BASE64 = 16 * 1024 * 1024;

/** GET /api/wardrobe — what you own, and optionally outfits from it. */
export async function GET(req: Request) {
  const { owner, plan, tasteId } = await readViewer(req);
  const cap = limitsFor(plan).wardrobe;

  if (!redisConfigured() || cap === 0) {
    return NextResponse.json(
      { configured: redisConfigured(), allowed: cap > 0, items: [], limit: cap, plan },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const items = await readOwned(owner);
  const wantOutfits = new URL(req.url).searchParams.get("outfits") === "1";

  if (!wantOutfits) {
    return NextResponse.json(
      { configured: true, allowed: true, items, limit: cap, plan },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const outfits = await buildOutfits(items, await tasteMemo(tasteId));
    return NextResponse.json(
      { configured: true, allowed: true, items, limit: cap, plan, ...outfits },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // The wardrobe is still worth returning even when the outfits fail.
    return NextResponse.json(
      { configured: true, allowed: true, items, limit: cap, plan, error: describeApiError(err) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

/** POST /api/wardrobe — read a batch of photos into the inventory. */
export async function POST(req: Request) {
  const { owner, plan } = await readViewer(req);
  if (!owner) {
    return NextResponse.json({ error: "Nothing identifies this browser yet." }, { status: 401 });
  }

  const cap = limitsFor(plan).wardrobe;
  if (cap === 0) {
    return NextResponse.json({ error: limitMessage("wardrobe", plan), plan }, { status: 402 });
  }

  let body: { photos?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const photos = (Array.isArray(body.photos) ? body.photos : [])
    .filter(
      (photo): photo is { data: string; mediaType: string } =>
        Boolean(photo) &&
        typeof (photo as { data?: unknown }).data === "string" &&
        typeof (photo as { mediaType?: unknown }).mediaType === "string" &&
        ALLOWED_MEDIA.includes((photo as { mediaType: string }).mediaType)
    )
    .slice(0, MAX_PHOTOS_PER_BATCH);

  if (!photos.length) {
    return NextResponse.json({ error: "Send photos as { data, mediaType }." }, { status: 400 });
  }
  if (photos.reduce((sum, photo) => sum + photo.data.length, 0) > MAX_TOTAL_BASE64) {
    return NextResponse.json({ error: "Those photos are too large together." }, { status: 413 });
  }

  const existing = await readOwned(owner);
  if (existing.length >= cap) {
    return NextResponse.json({ error: limitMessage("wardrobe", plan), plan }, { status: 402 });
  }

  try {
    const read = await readWardrobePhotos(photos);
    const added: OwnedGarment[] = read.map((item) => ({
      ...item,
      id: randomUUID().replace(/-/g, "").slice(0, 12),
      addedAt: new Date().toISOString(),
    }));

    const merged = [...existing, ...added].slice(0, cap);
    await writeOwned(owner, merged);

    return NextResponse.json(
      { ok: true, added: added.length, items: merged },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: describeApiError(err) }, { status: 502 });
  }
}

/** DELETE /api/wardrobe?id=… — the app misread something, or it's gone. */
export async function DELETE(req: Request) {
  const { owner } = await readViewer(req);
  if (!owner) return NextResponse.json({ error: "Not yours." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  const removed = await removeOwned(owner, id);
  if (!removed) return NextResponse.json({ error: "No such piece." }, { status: 404 });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
