import { NextRequest, NextResponse } from "next/server";
import { getListing, updateListing } from "@/lib/store";
import { fetchListingStats } from "@/lib/ebay";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Pull views + sold price/date from eBay for a listing linked via ebayItemId. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!listing.ebayItemId) {
    return NextResponse.json(
      { error: "No eBay item ID set on this listing yet" },
      { status: 400 }
    );
  }

  try {
    const stats = await fetchListingStats(listing.ebayItemId);
    await updateListing(listing.id, {
      status: stats.soldPrice !== undefined ? "sold" : listing.status,
      outcome: {
        views: stats.views ?? listing.outcome?.views ?? 0,
        watchers: listing.outcome?.watchers ?? 0,
        offers: listing.outcome?.offers ?? 0,
        soldPrice: stats.soldPrice ?? listing.outcome?.soldPrice,
        listedAt: listing.outcome?.listedAt,
        soldAt: stats.soldAt ?? listing.outcome?.soldAt,
        updatedAt: new Date().toISOString(),
      },
    });
    return NextResponse.json(await getListing(listing.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "eBay sync failed" },
      { status: 502 }
    );
  }
}
