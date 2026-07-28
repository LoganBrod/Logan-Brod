import { NextRequest, NextResponse } from "next/server";
import { getProposal, getListing, updateListing, updateProposal } from "@/lib/store";
import { reviseEbayListing } from "@/lib/ebay";

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

  const changes = {
    price: proposal.proposedPrice,
    title: proposal.proposedTitle,
    description: proposal.proposedDescription,
  };

  try {
    await reviseEbayListing(listing.ebayItemId, changes);
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
