import { getListing, updateListing, getSellerSettings, type Listing } from "./store";
import { publishToEbay } from "./ebay";
import { photoUrl } from "./photos";

export interface PublishOutcome {
  ok: boolean;
  error?: string;
  listing?: Listing;
}

/**
 * The actual eBay publish + store update, used by auto-publish for
 * high-confidence drafts. Deliberately terse on validation failures — this
 * path only ever runs unattended, so there's no seller reading the message;
 * a failure here just means the draft falls back to waiting for manual
 * review, same as if auto-publish were off.
 */
export async function publishListing(listingId: string, origin: string): Promise<PublishOutcome> {
  const listing = await getListing(listingId);
  if (!listing) return { ok: false, error: "Not found" };
  if (listing.publishedAt) return { ok: false, error: "Already published" };
  if (!listing.photos?.length) return { ok: false, error: "No photos" };
  if (!(listing.price > 0)) return { ok: false, error: "No price set" };

  const settings = await getSellerSettings();
  const packageWeightOz = listing.packageWeightOz ?? settings.defaultPackageWeightOz;
  if (!packageWeightOz || packageWeightOz <= 0) {
    return { ok: false, error: "No shipping weight set" };
  }

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
      packageWeightOz,
      packageDimensionsIn: listing.packageDimensionsIn,
    });

    await updateListing(listing.id, {
      status: "active",
      ebayItemId: result.listingId || undefined,
      ebaySku: result.sku,
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

    return { ok: true, listing: await getListing(listing.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Publishing to eBay failed" };
  }
}
