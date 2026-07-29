import { NextRequest, NextResponse } from "next/server";
import { listListings, getSellerSettings, updateListing } from "@/lib/store";
import { getPendingBestOffers, respondToBestOffer } from "@/lib/ebay";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Checks active listings for pending Best Offers and auto-accepts anything
 * at or above the seller's threshold. Off by default (autoAcceptOfferPct 0)
 * — this is the one automation here that commits to a real sale at a
 * discount without a human looking at it first, same caution as auto-publish.
 *
 * Designed to be called by an external cron service every 30 minutes or so —
 * eBay expires an unanswered Best Offer after 48 hours, so this doesn't need
 * to be much faster than that to catch everything before it lapses.
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
  if (!settings.autoAcceptOfferPct || settings.autoAcceptOfferPct <= 0) {
    return NextResponse.json({ ok: true, message: "Auto-accept is disabled", accepted: 0 });
  }

  const threshold = settings.autoAcceptOfferPct / 100;
  const candidates = (await listListings()).filter((l) => l.status === "active" && l.ebayItemId);

  const results: { listingId: string; accepted: boolean; price?: number; error?: string }[] = [];

  for (const listing of candidates) {
    try {
      const offers = await getPendingBestOffers(listing.ebayItemId!);
      const winner = offers.find((o) => listing.price > 0 && o.price >= listing.price * threshold);
      if (!winner) {
        results.push({ listingId: listing.id, accepted: false });
        continue;
      }

      await respondToBestOffer(listing.ebayItemId!, winner.bestOfferId, "Accept");

      // eBay settles the sale on its side; mirror it here immediately rather
      // than waiting on the next sync, which would only see the listing's
      // ask price, not the actual accepted offer amount.
      await updateListing(listing.id, {
        status: "sold",
        outcome: {
          views: listing.outcome?.views ?? 0,
          watchers: listing.outcome?.watchers ?? 0,
          offers: (listing.outcome?.offers ?? 0) + 1,
          soldPrice: winner.price,
          listedAt: listing.outcome?.listedAt,
          soldAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          trafficHistory: listing.outcome?.trafficHistory,
        },
      });

      results.push({ listingId: listing.id, accepted: true, price: winner.price });
    } catch (err) {
      results.push({
        listingId: listing.id,
        accepted: false,
        error: err instanceof Error ? err.message : "Couldn't check offers",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    accepted: results.filter((r) => r.accepted).length,
    checked: candidates.length,
    results,
  });
}
