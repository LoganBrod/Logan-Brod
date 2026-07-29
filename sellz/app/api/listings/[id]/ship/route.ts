import { NextRequest, NextResponse } from "next/server";
import { getListing, updateListing } from "@/lib/store";
import { markShipped, SHIPPING_CARRIERS, type ShippingCarrier } from "@/lib/ebay";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Records real carrier + tracking for a sold listing. When it's linked to a
 * live eBay item, the tracking also gets pushed to eBay via the Trading API
 * (CompleteSale) so the buyer actually sees it — recording it only here
 * would close the loop for us but not for them.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim().slice(0, 60) : "";
  const carrier: ShippingCarrier = SHIPPING_CARRIERS.includes(body.carrier) ? body.carrier : "Other";

  if (!trackingNumber) {
    return NextResponse.json({ error: "A tracking number is required" }, { status: 400 });
  }

  let syncedToEbay = false;
  let ebayError: string | undefined;

  if (listing.ebayItemId) {
    try {
      await markShipped(listing.ebayItemId, trackingNumber, carrier);
      syncedToEbay = true;
    } catch (err) {
      // Still record it locally — a failed eBay push shouldn't make the
      // seller lose the tracking number they just typed in.
      ebayError = err instanceof Error ? err.message : "Couldn't push tracking to eBay";
    }
  }

  const shippedAt = new Date().toISOString();
  await updateListing(listing.id, {
    shipping: { carrier, trackingNumber, shippedAt, syncedToEbay },
  });

  return NextResponse.json({
    ok: true,
    syncedToEbay,
    ebayError,
    listing: await getListing(listing.id),
  });
}
