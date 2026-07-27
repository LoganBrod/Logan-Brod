import { NextRequest, NextResponse } from "next/server";
import { deleteListing, getListing, updateListing } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(listing);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (["draft", "active", "sold", "stale", "ended"].includes(body.status)) {
    await updateListing(listing.id, { status: body.status });
  }
  if (typeof body.ebayItemId === "string") {
    await updateListing(listing.id, { ebayItemId: body.ebayItemId.trim().slice(0, 40) });
  }
  // Seller edits from the review step
  const edits: Record<string, unknown> = {};
  if (typeof body.title === "string") edits.title = body.title.trim().slice(0, 200);
  if (typeof body.description === "string") edits.description = body.description.slice(0, 4000);
  if (typeof body.condition === "string") edits.condition = body.condition.trim().slice(0, 200);
  if (isFinite(Number(body.price)) && Number(body.price) >= 0) edits.price = Number(body.price);
  if (Object.keys(edits).length) await updateListing(listing.id, edits);
  if (typeof body.manualComps === "string") {
    await updateListing(listing.id, {
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
  return NextResponse.json(await getListing(listing.id));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteListing(listing.id);
  return NextResponse.json({ ok: true });
}
