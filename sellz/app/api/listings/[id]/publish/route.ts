import { NextRequest, NextResponse } from "next/server";
import { getListing, updateListing } from "@/lib/store";
import { publishToEbay } from "@/lib/ebay";
import { photoUrl } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Publish a draft to eBay as a real, buyable listing. Deliberately explicit:
 * only ever called from the seller's "Approve & list" action.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (listing.publishedAt) {
    return NextResponse.json(
      { error: "This listing has already been published to eBay" },
      { status: 409 }
    );
  }
  if (!listing.photos?.length) {
    return NextResponse.json(
      { error: "eBay needs at least one photo — add photos before listing" },
      { status: 400 }
    );
  }
  if (!(listing.price > 0)) {
    return NextResponse.json({ error: "Set a price above $0 before listing" }, { status: 400 });
  }

  // eBay fetches images by URL, so they must be absolute and publicly reachable.
  const origin = process.env.PUBLIC_SITE_URL || req.nextUrl.origin;
  const imageUrls = listing.photos.map((p) => photoUrl(p, origin));

  try {
    const result = await publishToEbay({
      sku: `levoz-${listing.id}`,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      condition: listing.condition,
      imageUrls,
      itemSpecifics: listing.itemSpecifics?.map((s) => ({ name: s.name, value: s.value })),
    });

    await updateListing(listing.id, {
      status: "active",
      ebayItemId: result.listingId || undefined,
      ebaySku: result.sku,
      // Needed to end this listing again later; relist acts on the offer id.
      ebayOfferId: result.offerId || undefined,
      publishedAt: new Date().toISOString(),
      outcome: {
        views: listing.outcome?.views ?? 0,
        watchers: listing.outcome?.watchers ?? 0,
        offers: listing.outcome?.offers ?? 0,
        soldPrice: listing.outcome?.soldPrice,
        listedAt: new Date().toISOString(),
        soldAt: listing.outcome?.soldAt,
        updatedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ ...result, listing: await getListing(listing.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publishing to eBay failed" },
      { status: 502 }
    );
  }
}
