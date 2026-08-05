import crypto from "crypto";
import { fetchAllEbayListings, fetchEbayItem } from "@/lib/ebay";
import { addListing, listListings, updateListing, type Listing } from "@/lib/store";

export interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
  syncedAt: string;
}

/**
 * Pull every listing on a seller's connected eBay account and reconcile it
 * into the local store, matching on eBay item id so repeat syncs update
 * rather than duplicate. Anything enriched locally (cost basis, Brain score,
 * comps, diagnosis) is preserved.
 *
 * Lives here rather than in the route because two callers need it: the "Sync
 * from eBay" button and the scheduled pipeline. Duplicating it would mean two
 * reconciliation rules that drift, and reconciliation is where duplicates and
 * lost history come from.
 *
 * Takes a userId rather than reading the session, so the scheduled caller can
 * run it for a tenant with nobody signed in.
 */
export async function syncEbayListings(userId: string): Promise<SyncResult> {
  const live = await fetchAllEbayListings(userId);

  const existing = await listListings(userId);
  const byItemId = new Map(existing.filter((l) => l.ebayItemId).map((l) => [l.ebayItemId!, l]));

  // The bulk call only returns the gallery image, so a listing with eight
  // photos looks like it has one. Ask for the full set per item — but that is
  // one call each, so only for listings that still look photo-poor, capped and
  // time-boxed so a large account can't run the function out of time. Whatever
  // is missed is picked up on the next sync.
  const deadline = Date.now() + 45_000;
  const needsPhotos = live.filter((l) => (l.imageUrls?.length ?? 0) <= 1).slice(0, 60);
  for (let i = 0; i < needsPhotos.length; i += 4) {
    if (Date.now() > deadline) break;
    await Promise.all(
      needsPhotos.slice(i, i + 4).map(async (l) => {
        try {
          const detail = await fetchEbayItem(userId, l.itemId);
          if (detail.imageUrls.length > (l.imageUrls?.length ?? 0)) {
            l.imageUrls = detail.imageUrls;
          }
        } catch {
          // One item failing must not abandon the whole sync.
        }
      })
    );
  }

  let created = 0;
  let updated = 0;

  for (const l of live) {
    const prior = byItemId.get(l.itemId);
    const views = prior?.outcome?.views ?? 0;
    // eBay does not return watch count on every call; keep the known value
    // rather than overwriting a real number with a missing one.
    const watchers = l.watchers ?? prior?.outcome?.watchers ?? 0;
    // One reading per sync, capped so a long-lived listing's history doesn't
    // grow without bound. Only meaningful for active listings — a sold or
    // ended one stops accumulating readings on its own.
    const trafficHistory =
      l.status === "active"
        ? [
            ...(prior?.outcome?.trafficHistory ?? []),
            { views, watchers, at: new Date().toISOString() },
          ].slice(-60)
        : prior?.outcome?.trafficHistory;
    const outcome = {
      views,
      watchers,
      offers: prior?.outcome?.offers ?? 0,
      soldPrice: l.soldPrice ?? prior?.outcome?.soldPrice,
      listedAt: l.listedAt ?? prior?.outcome?.listedAt,
      soldAt: l.soldAt ?? prior?.outcome?.soldAt,
      updatedAt: new Date().toISOString(),
      trafficHistory,
    };

    if (prior) {
      await updateListing(userId, prior.id, {
        title: l.title || prior.title,
        price: l.price || prior.price,
        status: l.status === "ended" ? "ended" : l.status,
        ebayListingType: l.listingType ?? prior.ebayListingType,
        imageUrls: l.imageUrls?.length ? l.imageUrls : prior.imageUrls,
        outcome,
      });
      updated++;
    } else {
      const listing: Listing = {
        id: crypto.randomUUID(),
        platform: "ebay",
        title: l.title,
        description: "",
        price: l.price,
        category: "",
        condition: "",
        tags: [],
        photosNote: "",
        status: l.status === "ended" ? "ended" : l.status,
        source: "imported",
        ebayItemId: l.itemId,
        ebayListingType: l.listingType,
        imageUrls: l.imageUrls,
        experimentId: "control",
        outcome,
        createdAt: l.listedAt ?? new Date().toISOString(),
      };
      await addListing(userId, listing);
      created++;
    }
  }

  return {
    fetched: live.length,
    created,
    updated,
    syncedAt: new Date().toISOString(),
  };
}
