import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing, updateListing, getSellerSettings } from "@/lib/store";
import {
  buyShippingLabel,
  findOrderIdForItem,
  getShippingRates,
  hasLogisticsScope,
  markShipped,
  type ShippingCarrier,
  SHIPPING_CARRIERS,
} from "@/lib/ebay";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Shared preconditions for both quoting and buying. */
async function resolveOrder(userId: string, listingId: string) {
  const listing = await getListing(userId, listingId);
  if (!listing) return { error: "Not found", status: 404 as const };
  if (!(await hasLogisticsScope(userId))) {
    return {
      error:
        "This eBay connection can't buy postage yet. Enable label buying on the Brain page to re-authorise with shipping permissions.",
      status: 403 as const,
    };
  }
  if (!listing.ebayItemId) {
    return { error: "This listing isn't linked to an eBay item", status: 400 as const };
  }
  const settings = await getSellerSettings(userId);
  const weight = listing.packageWeightOz ?? settings.defaultPackageWeightOz;
  if (!weight || weight <= 0) {
    return { error: "Set the packed weight before quoting postage", status: 400 as const };
  }
  return { listing, weight };
}

/**
 * Live postage rates for a sold listing. Read-only: this asks eBay what
 * postage would cost and buys nothing, so it's safe to call on render.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const resolved = await resolveOrder(userId, params.id);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { listing, weight } = resolved;

  try {
    const orderId = await findOrderIdForItem(userId, listing.ebayItemId!);
    if (!orderId) {
      return NextResponse.json(
        { error: "Couldn't find the eBay order for this sale — it may be too old to look up." },
        { status: 404 }
      );
    }
    const quote = await getShippingRates(userId, orderId, weight, listing.packageDimensionsIn);
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't get postage rates" },
      { status: 502 }
    );
  }
}

/**
 * Buys the seller's chosen rate. This spends real money, so it only ever runs
 * from an explicit confirmation carrying a specific rateId the seller saw the
 * price of — there is no "cheapest option" default and nothing auto-selects.
 *
 * On success the tracking is pushed straight back to eBay as shipped and
 * recorded locally, since a bought label the order doesn't know about would
 * leave the buyer staring at an unshipped order.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const resolved = await resolveOrder(userId, params.id);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { listing } = resolved;

  const body = await req.json().catch(() => ({}));
  const shippingQuoteId = typeof body.shippingQuoteId === "string" ? body.shippingQuoteId : "";
  const rateId = typeof body.rateId === "string" ? body.rateId : "";
  if (!shippingQuoteId || !rateId) {
    return NextResponse.json(
      { error: "Pick a specific rate — nothing is chosen for you when money is involved." },
      { status: 400 }
    );
  }
  if (listing.shipping?.labelUrl) {
    return NextResponse.json(
      { error: "A label was already bought for this listing." },
      { status: 409 }
    );
  }

  let label;
  try {
    label = await buyShippingLabel(userId, shippingQuoteId, rateId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't buy the label" },
      { status: 502 }
    );
  }

  // The label is bought and billed from here on. Everything below is
  // bookkeeping — it must never throw away the label the seller just paid
  // for, so each step degrades instead of failing the request.
  const carrier: ShippingCarrier = SHIPPING_CARRIERS.includes(label.carrier as ShippingCarrier)
    ? (label.carrier as ShippingCarrier)
    : "Other";

  let syncedToEbay = false;
  if (label.trackingNumber) {
    try {
      await markShipped(userId, listing.ebayItemId!, label.trackingNumber, carrier);
      syncedToEbay = true;
    } catch {
      // Buyer-visible tracking failed; the seller can still retry from the
      // manual "Mark shipped" box with the number recorded below.
    }
  }

  await updateListing(userId, listing.id, {
    shipping: {
      carrier: label.carrier || carrier,
      trackingNumber: label.trackingNumber,
      shippedAt: new Date().toISOString(),
      syncedToEbay,
      labelUrl: label.labelUrl,
      labelCost: label.cost,
      shipmentId: label.shipmentId,
    },
    // Postage is a real cost against this sale; folding it in keeps the
    // profit figure honest rather than flattering.
    cost: {
      ...listing.cost,
      shippingCost: (listing.cost?.shippingCost ?? 0) + label.cost,
      updatedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    syncedToEbay,
    label,
    listing: await getListing(userId, listing.id),
  });
}
