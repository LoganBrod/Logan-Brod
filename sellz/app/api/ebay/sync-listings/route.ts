import { NextResponse } from "next/server";
import crypto from "crypto";
import { fetchAllEbayListings, fetchEbayItem } from "@/lib/ebay";
import { addListing, getEbayTokens, listListings, updateListing, type Listing } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Pull every listing on the connected eBay account and reconcile it into the
 * local store, matching on eBay item id so repeat syncs update rather than
 * duplicate. Anything the seller already enriched locally (cost basis, Brain
 * score, comps, diagnosis) is preserved.
 */
export async function POST() {
  if (!(await getEbayTokens())) {
    return NextResponse.json({ error: "Connect your eBay account first" }, { status: 400 });
  }

  let live;
  try {
    live = await fetchAllEbayListings();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't reach eBay" },
      { status: 502 }
    );
  }

  const existing = await listListings();
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
          const detail = await fetchEbayItem(l.itemId);
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
    const outcome = {
      views: prior?.outcome?.views ?? 0,
      // eBay does not return watch count on every call; keep the known value
      // rather than overwriting a real number with a missing one.
      watchers: l.watchers ?? prior?.outcome?.watchers ?? 0,
      offers: prior?.outcome?.offers ?? 0,
      soldPrice: l.soldPrice ?? prior?.outcome?.soldPrice,
      listedAt: l.listedAt ?? prior?.outcome?.listedAt,
      soldAt: l.soldAt ?? prior?.outcome?.soldAt,
      updatedAt: new Date().toISOString(),
    };

    if (prior) {
      await updateListing(prior.id, {
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
        id: crypto.randomUUID().slice(0, 8),
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
      await addListing(listing);
      created++;
    }
  }

  return NextResponse.json({
    ok: true,
    fetched: live.length,
    created,
    updated,
    syncedAt: new Date().toISOString(),
  });
}
