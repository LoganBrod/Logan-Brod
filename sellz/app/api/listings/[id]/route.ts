import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { deleteListing, getListing, updateListing } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(listing);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  // "scheduled" belongs here too: leaving it out silently dropped the status
  // change, so scheduling a listing left it sitting as a draft and the
  // publish cron — which only looks for "scheduled" — never picked it up.
  if (["draft", "active", "sold", "stale", "ended", "scheduled"].includes(body.status)) {
    await updateListing(userId, listing.id, { status: body.status });
  }
  if (typeof body.scheduledPublishAt === "string" && !isNaN(Date.parse(body.scheduledPublishAt))) {
    await updateListing(userId, listing.id, {
      scheduledPublishAt: new Date(body.scheduledPublishAt).toISOString(),
    });
  }
  if (typeof body.ebayItemId === "string") {
    await updateListing(userId, listing.id, { ebayItemId: body.ebayItemId.trim().slice(0, 40) });
  }
  // Seller edits from the review step
  const edits: Record<string, unknown> = {};
  if (typeof body.title === "string") edits.title = body.title.trim().slice(0, 200);
  if (typeof body.description === "string") edits.description = body.description.slice(0, 4000);
  if (typeof body.condition === "string") edits.condition = body.condition.trim().slice(0, 200);
  if (isFinite(Number(body.price)) && Number(body.price) >= 0) edits.price = Number(body.price);
  if (isFinite(Number(body.packageWeightOz)) && Number(body.packageWeightOz) > 0) {
    edits.packageWeightOz = Number(body.packageWeightOz);
  }
  if (Object.keys(edits).length) await updateListing(userId, listing.id, edits);
  if (typeof body.manualComps === "string") {
    await updateListing(userId, listing.id, {
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
  return NextResponse.json(await getListing(userId, listing.id));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteListing(userId, listing.id);
  return NextResponse.json({ ok: true });
}
