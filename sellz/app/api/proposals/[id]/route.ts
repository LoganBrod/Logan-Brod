import { NextRequest, NextResponse } from "next/server";
import { getProposal, getListing, updateListing, updateProposal, type RelistRecord } from "@/lib/store";
import { reviseEbayListing, relistItem } from "@/lib/ebay";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Approve or dismiss a proposal. Approving is the only path that writes to
 * eBay, and it revises the live listing in place rather than ending and
 * recreating it.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const proposal = await getProposal(params.id);
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (proposal.status !== "pending") {
    return NextResponse.json(
      { error: `This proposal was already ${proposal.status}` },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action === "approve" ? "approve" : "dismiss";

  if (action === "dismiss") {
    await updateProposal(proposal.id, {
      status: "dismissed",
      resolvedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  const listing = await getListing(proposal.listingId);
  if (!listing) return NextResponse.json({ error: "Listing is gone" }, { status: 404 });
  if (!listing.ebayItemId) {
    return NextResponse.json(
      { error: "This listing is not linked to a live eBay item" },
      { status: 400 }
    );
  }

  // A "relist" proposal has no price/title/description of its own — the
  // whole point is ending and republishing for a freshness boost — so it
  // needs relistItem, not reviseEbayListing. Sending it through the revise
  // path left nothing to revise and failed every single time.
  if (proposal.kind === "relist") {
    if (!listing.ebayOfferId) {
      const message =
        "This listing wasn't published through LevoZ, so there's no eBay offer to withdraw — it can't be relisted from here.";
      await updateProposal(proposal.id, { status: "failed", error: message });
      return NextResponse.json({ error: message }, { status: 409 });
    }
    try {
      const newPrice = proposal.proposedPrice ?? listing.price;
      const result = await relistItem(listing.ebayOfferId, newPrice);
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
        lastRelistedAt: record.at,
      });
      await updateProposal(proposal.id, { status: "applied", resolvedAt: record.at });
      return NextResponse.json({
        ok: true,
        status: "applied",
        listing: await getListing(listing.id),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Relist failed";
      await updateProposal(proposal.id, { status: "failed", error: message });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const changes = {
    price: proposal.proposedPrice,
    title: proposal.proposedTitle,
    description: proposal.proposedDescription,
  };

  try {
    await reviseEbayListing(listing.ebayItemId, changes, listing.ebayListingType);
  } catch (err) {
    const message = err instanceof Error ? err.message : "eBay rejected the change";
    await updateProposal(proposal.id, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Only mirror locally once eBay has accepted it, so the app never claims a
  // change that did not actually land.
  await updateListing(listing.id, {
    ...(changes.price !== undefined ? { price: changes.price } : {}),
    ...(changes.title ? { title: changes.title } : {}),
    ...(changes.description ? { description: changes.description } : {}),
  });
  await updateProposal(proposal.id, {
    status: "applied",
    resolvedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, status: "applied", listing: await getListing(listing.id) });
}
