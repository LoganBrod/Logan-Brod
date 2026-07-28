import { NextRequest, NextResponse } from "next/server";
import {
  listListings,
  getSellerSettings,
  updateListing,
} from "@/lib/store";
import { relistItem, researchEbayComps } from "@/lib/ebay";
import { getPhoto } from "@/lib/photos";
import type { RelistRecord } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Daily relist check: finds active listings that have exceeded their relist
 * cadence and automatically relists them at a Brain-optimized price.
 *
 * Designed to be called by an external cron service once per day.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const settings = await getSellerSettings();
  if (!settings.relistEnabled) {
    return NextResponse.json({ ok: true, message: "Relist is disabled", relisted: 0 });
  }

  const defaultDays = settings.defaultRelistDays ?? 10;
  const now = Date.now();
  const listings = await listListings();

  // Find active listings that have exceeded their relist cadence
  const candidates = listings.filter((l) => {
    // Only listings we published ourselves have an Inventory API offer to
    // withdraw. Without one there is nothing to end, and republishing would
    // leave a second live listing for the same item.
    if (l.status !== "active" || !l.ebayOfferId) return false;

    const cadence = l.relistCadenceDays ?? defaultDays;
    const lastActivity = l.lastRelistedAt ?? l.publishedAt ?? l.createdAt;
    const daysSince = (now - Date.parse(lastActivity)) / 86400000;

    return daysSince >= cadence;
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, relisted: 0 });
  }

  const results: { listingId: string; ok: boolean; oldPrice: number; newPrice: number; error?: string }[] = [];

  for (const listing of candidates) {
    try {
      // Research current market price for Brain-optimized relist pricing
      let newPrice = listing.price;
      let base64: string | undefined;
      if (listing.photos?.length) {
        const photo = await getPhoto(listing.photos[0]);
        base64 = photo?.data.toString("base64");
      }

      const comps = await researchEbayComps(listing.title, base64).catch(() => null);
      if (comps?.suggestedPrice && comps.suggestedPrice > 0) {
        // Never drop more than 20% in a single relist cycle
        const floor = listing.price * 0.8;
        newPrice = Math.max(floor, comps.suggestedPrice);
      }

      const result = await relistItem(listing.ebayOfferId!, newPrice);

      const record: RelistRecord = {
        oldItemId: listing.ebayItemId ?? "",
        newItemId: result.newListingId,
        oldPrice: listing.price,
        newPrice,
        at: new Date().toISOString(),
      };

      await updateListing(listing.id, {
        ebayItemId: result.newListingId,
        price: newPrice,
        relistHistory: [...(listing.relistHistory ?? []), record],
        lastRelistedAt: new Date().toISOString(),
      });

      results.push({
        listingId: listing.id,
        ok: true,
        oldPrice: listing.price,
        newPrice,
      });
    } catch (err) {
      results.push({
        listingId: listing.id,
        ok: false,
        oldPrice: listing.price,
        newPrice: listing.price,
        error: err instanceof Error ? err.message : "Relist failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    relisted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
