import { NextRequest, NextResponse } from "next/server";
import { listListings, updateListing } from "@/lib/store";
import { publishToEbay } from "@/lib/ebay";
import { getPhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Scheduled publish: checks for listings with status "scheduled" whose
 * scheduledPublishAt time has passed, and publishes them to eBay.
 *
 * Designed to be called by an external cron service every 15 minutes.
 * Protected by a simple bearer token in production.
 */
export async function POST(req: NextRequest) {
  // Simple auth: check for a cron secret if set
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();
  const listings = await listListings();
  const scheduled = listings.filter(
    (l) =>
      l.status === "scheduled" &&
      l.scheduledPublishAt &&
      Date.parse(l.scheduledPublishAt) <= now
  );

  if (scheduled.length === 0) {
    return NextResponse.json({ ok: true, published: 0 });
  }

  const results: { listingId: string; ok: boolean; error?: string }[] = [];

  for (const listing of scheduled) {
    try {
      // Collect photo URLs for the listing
      const imageUrls: string[] = [];
      for (const photoId of listing.photos ?? []) {
        const photo = await getPhoto(photoId);
        if (photo) {
          // Photos are served via the API route
          const base = process.env.URL || process.env.DEPLOY_URL || "http://localhost:3000";
          imageUrls.push(`${base}/api/photos/${photoId}`);
        }
      }

      if (imageUrls.length === 0) {
        results.push({
          listingId: listing.id,
          ok: false,
          error: "No photos available for publishing",
        });
        continue;
      }

      const sku = `levoz-${listing.id}-${Date.now()}`;
      const result = await publishToEbay({
        sku,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        condition: listing.condition,
        imageUrls,
        itemSpecifics: listing.itemSpecifics?.map((s) => ({
          name: s.name,
          value: s.value,
        })),
      });

      await updateListing(listing.id, {
        status: "active",
        ebayItemId: result.listingId,
        ebaySku: sku,
        // Needed to end this listing again later; relist acts on the offer id.
        ebayOfferId: result.offerId || undefined,
        publishedAt: new Date().toISOString(),
        scheduledPublishAt: undefined,
        outcome: {
          views: 0,
          watchers: 0,
          offers: 0,
          listedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      results.push({ listingId: listing.id, ok: true });
    } catch (err) {
      results.push({
        listingId: listing.id,
        ok: false,
        error: err instanceof Error ? err.message : "Publish failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    published: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
