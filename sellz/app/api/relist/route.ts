import { NextRequest, NextResponse } from "next/server";
import { getListing, updateListing, type RelistRecord } from "@/lib/store";
import { relistItem, researchEbayComps } from "@/lib/ebay";
import { getPhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Relist a single listing on eBay: withdraw the old offer, create a new one
 * at the Brain's suggested price, and publish it for a freshness boost.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  const forcePrice = typeof body.price === "number" ? body.price : undefined;

  if (!listingId) {
    return NextResponse.json({ error: "listingId is required" }, { status: 400 });
  }

  const listing = await getListing(listingId);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  // Relisting withdraws and republishes an Inventory API offer. Listings
  // created in the eBay app or web UI have no offer we can act on, so refuse
  // rather than publish a second copy of an item that is still live.
  if (!listing.ebayOfferId) {
    return NextResponse.json(
      {
        error:
          "This listing wasn't published through LevoZ, so there's no eBay offer to relist. Only listings published from here can be cycled.",
      },
      { status: 400 }
    );
  }

  try {
    // Determine the new price. If forcePrice is set, use that. Otherwise,
    // research comps and ask the Brain for an optimized price.
    let newPrice = forcePrice ?? listing.price;

    if (!forcePrice) {
      // Re-comp against current market
      let base64: string | undefined;
      if (listing.photos?.length) {
        const photo = await getPhoto(listing.photos[0]);
        base64 = photo?.data.toString("base64");
      }
      const comps = await researchEbayComps(listing.title, base64).catch(() => null);

      if (comps?.suggestedPrice && comps.suggestedPrice > 0) {
        // Use the median of current comps as the new price, but never drop
        // more than 20% from the current ask in a single relist cycle.
        const floor = listing.price * 0.8;
        newPrice = Math.max(floor, comps.suggestedPrice);
      }
    }

    const result = await relistItem(listing.ebayOfferId, newPrice);

    const record: RelistRecord = {
      oldItemId: listing.ebayItemId ?? "",
      newItemId: result.newListingId,
      oldPrice: listing.price,
      newPrice,
      at: new Date().toISOString(),
    };

    await updateListing(listingId, {
      ebayItemId: result.newListingId,
      price: newPrice,
      relistHistory: [...(listing.relistHistory ?? []), record],
      lastRelistedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      oldItemId: listing.ebayItemId,
      newItemId: result.newListingId,
      oldPrice: listing.price,
      newPrice,
      url: result.url,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Relist failed" },
      { status: 502 }
    );
  }
}
