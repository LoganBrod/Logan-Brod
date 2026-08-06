import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing } from "@/lib/store";
import { getPhoto } from "@/lib/photos";
import { isMarketplaceId } from "@/lib/marketplaces";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Beyond this the message gets unwieldy and the compose form is slow anyway. */
const MAX_PHOTOS = 6;
/** Keep the payload sane; a phone photo can be several megabytes. */
const MAX_BYTES = 4_000_000;

/**
 * Everything the browser extension needs to fill one marketplace form.
 *
 * Photos come back as data URLs rather than links. That is deliberate: it
 * means the extension needs no host permission on this app at all, so it
 * cannot read anything here beyond what this route hands it for the listing
 * the seller just clicked. The alternative — granting the extension access to
 * our domain so it could fetch /api/photos itself — would give it standing
 * access to every photo the seller owns, to save a round trip.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const marketplace = req.nextUrl.searchParams.get("m") ?? "";
  if (!isMarketplaceId(marketplace)) {
    return NextResponse.json({ error: "Unknown marketplace" }, { status: 404 });
  }

  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const state = listing.marketplaces?.[marketplace] ?? (marketplace === "depop" ? listing.depop : undefined);
  const draft = state?.draft;
  if (!draft) {
    return NextResponse.json({ error: "Write the listing first" }, { status: 400 });
  }

  const photos: string[] = [];
  let bytes = 0;
  for (const id of (listing.photos ?? []).slice(0, MAX_PHOTOS)) {
    try {
      const photo = await getPhoto(userId, id);
      if (!photo) continue;
      if (bytes + photo.data.length > MAX_BYTES) break;
      bytes += photo.data.length;
      photos.push(`data:${photo.contentType};base64,${photo.data.toString("base64")}`);
    } catch {
      // A photo we can't read costs that photo, not the handoff.
    }
  }

  return NextResponse.json({ marketplace, draft, photos });
}
