import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing, updateListing, type RelistRecord } from "@/lib/store";
import { relistItem, reviseEbayListing } from "@/lib/ebay";
import { photoUrl } from "@/lib/photos";
import { publicOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Accept a fix for a weak listing and push it to eBay.
 *
 * Two ways to land a change on a live listing:
 *
 *  - Revise, which edits it in place and keeps its watchers, its position in
 *    search, and costs nothing.
 *  - Relist, which ends it and puts it back up fresh. That resets the age but
 *    loses every watcher and can cost an insertion fee.
 *
 * Revise is therefore the default, and relisting only happens when the seller
 * explicitly asks for it. eBay also treats recycling listings purely to reset
 * their exposure as search manipulation, which is the other reason not to do
 * it automatically.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : undefined;
  const description =
    typeof body.description === "string" ? body.description.slice(0, 4000) : undefined;
  const price =
    isFinite(Number(body.price)) && Number(body.price) > 0 ? Number(body.price) : undefined;
  const addPhotoIds: string[] = Array.isArray(body.addPhotoIds)
    ? body.addPhotoIds.filter((p: unknown): p is string => typeof p === "string").slice(0, 20)
    : [];
  const wantsRelist = body.relist === true;

  if (!title && !description && price === undefined && addPhotoIds.length === 0) {
    return NextResponse.json({ error: "Nothing to apply" }, { status: 400 });
  }

  const photos = [...(listing.photos ?? []), ...addPhotoIds];

  // Photos live on our own domain and eBay fetches them by URL, so the public
  // origin has to be right or the revise silently drops them.
  const origin = publicOrigin(new URL(req.url).origin);
  const allImageUrls = [
    ...photos.map((id) => photoUrl(id, origin)),
    ...(listing.imageUrls ?? []),
  ];

  const isLive = Boolean(listing.ebayItemId) && listing.status === "active";
  let relisted: RelistRecord | undefined;

  const edits = {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(addPhotoIds.length ? { photos } : {}),
    // The old grade described the old listing; drop it so the card doesn't
    // keep showing a stale score next to freshly changed content.
    brainScore: undefined,
  };

  if (isLive) {
    try {
      await reviseEbayListing(userId, 
        listing.ebayItemId!,
        {
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          ...(price !== undefined ? { price } : {}),
          // Only send photos when they changed: PictureDetails replaces the
          // whole set, so an unnecessary send risks churning a good listing.
          ...(addPhotoIds.length ? { imageUrls: allImageUrls } : {}),
        },
        listing.ebayListingType
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "eBay rejected the change" },
        { status: 502 }
      );
    }

    if (wantsRelist) {
      // The revise already landed on eBay by this point, so whatever happens
      // next the local copy has to record it — otherwise the app shows the old
      // title while the live listing shows the new one.
      const relistError = async (message: string, status: number) => {
        await updateListing(userId, listing.id, edits);
        return NextResponse.json(
          { error: `${message} The edits themselves are live on eBay and saved here.` },
          { status }
        );
      };

      if (!listing.ebayOfferId) {
        return relistError(
          "This listing can't be relisted: it wasn't published through LevoZ, so there's no eBay offer to withdraw.",
          409
        );
      }
      try {
        const result = await relistItem(userId, listing.ebayOfferId, price ?? listing.price);
        relisted = {
          oldItemId: listing.ebayItemId ?? "",
          newItemId: result.newListingId,
          oldPrice: listing.price,
          newPrice: price ?? listing.price,
          at: new Date().toISOString(),
        };
      } catch (err) {
        return relistError(err instanceof Error ? err.message : "Relist failed.", 502);
      }
    }
  }

  // Mirror locally only after eBay accepted, so the app never shows a change
  // that did not actually land.
  await updateListing(userId, listing.id, {
    ...edits,
    ...(relisted
      ? {
          ebayItemId: relisted.newItemId,
          relistHistory: [...(listing.relistHistory ?? []), relisted],
          lastRelistedAt: relisted.at,
        }
      : {}),
  });

  return NextResponse.json({
    ok: true,
    appliedToEbay: isLive,
    relisted: Boolean(relisted),
    listing: await getListing(userId, listing.id),
  });
}
