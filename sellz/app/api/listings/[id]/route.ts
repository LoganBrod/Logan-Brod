import { NextRequest, NextResponse } from "next/server";
import { deleteListing, getListing, updateListing } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(listing);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (["draft", "active", "sold", "stale", "ended"].includes(body.status)) {
    updateListing(listing.id, { status: body.status });
  }
  if (typeof body.manualComps === "string") {
    updateListing(listing.id, {
      comps: {
        summary: listing.comps?.summary ?? "",
        priceLow: listing.comps?.priceLow,
        priceHigh: listing.comps?.priceHigh,
        demandNotes: listing.comps?.demandNotes ?? "",
        sources: listing.comps?.sources ?? [],
        manualNotes: body.manualComps.slice(0, 1000),
        at: listing.comps?.at ?? new Date().toISOString(),
      },
    });
  }
  return NextResponse.json(getListing(listing.id));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteListing(listing.id);
  return NextResponse.json({ ok: true });
}
