import { NextRequest, NextResponse } from "next/server";
import { getPhotoById } from "@/lib/photos";

export const runtime = "nodejs";

/**
 * Serves a stored photo. Public by design — eBay fetches these URLs while
 * publishing and for the life of the listing, with no session to present.
 *
 * That makes the photo id itself the capability, so it must stay unguessable
 * (ids are random uuids) and the owner is resolved server-side from the id
 * rather than being encoded in the URL. Deliberately no session check: adding
 * one would break every image on every already-published listing.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[a-z0-9-]{1,64}$/i.test(params.id)) {
    return NextResponse.json({ error: "Bad photo id" }, { status: 400 });
  }
  const photo = await getPhotoById(params.id);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
