import { NextRequest, NextResponse } from "next/server";
import { listListings, getSellerSettings, updateListing, type RelistRecord } from "@/lib/store";
import { relistItem, researchEbayComps } from "@/lib/ebay";
import { getPhoto } from "@/lib/photos";
import { cronAuthorized, tenantsWithEbay } from "@/lib/cron";
import { planAllows } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Daily relist check across every tenant: finds active listings past their
 * relist cadence and republishes them at a Brain-optimised price.
 *
 * Each seller's own relistEnabled toggle still governs whether anything
 * happens for them, so this firing on a schedule is safe regardless.
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const results: {
    userId: string;
    listingId: string;
    ok: boolean;
    oldPrice: number;
    newPrice: number;
    error?: string;
  }[] = [];

  for (const userId of await tenantsWithEbay()) {
    let candidates;
    try {
      // Paid feature, and the seller's own toggle on top of that.
      if (!(await planAllows(userId, "autoRelist"))) continue;
      const settings = await getSellerSettings(userId);
      if (!settings.relistEnabled) continue;
      const defaultDays = settings.defaultRelistDays ?? 10;

      candidates = (await listListings(userId)).filter((l) => {
        // Only listings published from here have an Inventory API offer to
        // withdraw. Without one there is nothing to end, and republishing
        // would leave a second live listing for the same item.
        if (l.status !== "active" || !l.ebayOfferId) return false;
        const cadence = l.relistCadenceDays ?? defaultDays;
        const lastActivity = l.lastRelistedAt ?? l.publishedAt ?? l.createdAt;
        return (now - Date.parse(lastActivity)) / 86400000 >= cadence;
      });
    } catch {
      continue;
    }

    for (const listing of candidates) {
      try {
        let newPrice = listing.price;
        let base64: string | undefined;
        if (listing.photos?.length) {
          const photo = await getPhoto(userId, listing.photos[0]);
          base64 = photo?.data.toString("base64");
        }

        const comps = await researchEbayComps(userId, listing.title, base64).catch(() => null);
        if (comps?.suggestedPrice && comps.suggestedPrice > 0) {
          // Never drop more than 20% in a single relist cycle.
          newPrice = Math.max(listing.price * 0.8, comps.suggestedPrice);
        }

        const result = await relistItem(userId, listing.ebayOfferId!, newPrice);
        const record: RelistRecord = {
          oldItemId: listing.ebayItemId ?? "",
          newItemId: result.newListingId,
          oldPrice: listing.price,
          newPrice,
          at: new Date().toISOString(),
        };

        await updateListing(userId, listing.id, {
          ebayItemId: result.newListingId,
          price: newPrice,
          relistHistory: [...(listing.relistHistory ?? []), record],
          lastRelistedAt: record.at,
        });

        results.push({
          userId,
          listingId: listing.id,
          ok: true,
          oldPrice: listing.price,
          newPrice,
        });
      } catch (err) {
        results.push({
          userId,
          listingId: listing.id,
          ok: false,
          oldPrice: listing.price,
          newPrice: listing.price,
          error: err instanceof Error ? err.message : "Relist failed",
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    relisted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
