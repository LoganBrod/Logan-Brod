import { NextRequest, NextResponse } from "next/server";
import { listListings, getSellerSettings, updateListing } from "@/lib/store";
import { getPendingBestOffers, respondToBestOffer } from "@/lib/ebay";
import { cronAuthorized, tenantsWithEbay } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Checks active listings for pending Best Offers and auto-accepts anything at
 * or above each seller's threshold. Off by default (autoAcceptOfferPct 0) —
 * this is the one automation that commits to a real sale at a discount with
 * nobody looking, same caution as auto-publish.
 *
 * Runs across every tenant, so one seller's eBay outage must not stop the
 * others: failures are collected per seller rather than thrown.
 *
 * eBay expires an unanswered Best Offer after 48 hours, so a ~30 minute
 * cadence catches everything with room to spare.
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perTenant: {
    userId: string;
    accepted: number;
    checked: number;
    skipped?: string;
    error?: string;
  }[] = [];

  for (const userId of await tenantsWithEbay()) {
    try {
      const settings = await getSellerSettings(userId);
      if (!settings.autoAcceptOfferPct || settings.autoAcceptOfferPct <= 0) {
        perTenant.push({ userId, accepted: 0, checked: 0, skipped: "disabled" });
        continue;
      }

      const threshold = settings.autoAcceptOfferPct / 100;
      const candidates = (await listListings(userId)).filter(
        (l) => l.status === "active" && l.ebayItemId
      );

      let accepted = 0;
      for (const listing of candidates) {
        try {
          const offers = await getPendingBestOffers(userId, listing.ebayItemId!);
          const winner = offers.find(
            (o) => listing.price > 0 && o.price >= listing.price * threshold
          );
          if (!winner) continue;

          await respondToBestOffer(userId, listing.ebayItemId!, winner.bestOfferId, "Accept");

          // eBay settles the sale on its side; mirror it here immediately
          // rather than waiting on the next sync, which would only see the
          // listing's ask price, not the actual accepted offer amount.
          await updateListing(userId, listing.id, {
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
          accepted++;
        } catch {
          // One listing failing should not abandon the rest of this seller's.
        }
      }
      perTenant.push({ userId, accepted, checked: candidates.length });
    } catch (err) {
      perTenant.push({
        userId,
        accepted: 0,
        checked: 0,
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    tenants: perTenant.length,
    accepted: perTenant.reduce((n, t) => n + t.accepted, 0),
    results: perTenant,
  });
}
