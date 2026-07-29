import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing, updateListing } from "@/lib/store";

export const runtime = "nodejs";

/** Record traffic + sale outcome for a listing. */
export async function PUT(
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
  const n = (v: unknown) => (isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const d = (v: unknown) =>
    typeof v === "string" && isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined;

  await updateListing(userId, listing.id, {
    outcome: {
      views: n(body.views),
      watchers: n(body.watchers),
      offers: n(body.offers),
      soldPrice: isFinite(Number(body.soldPrice)) && Number(body.soldPrice) > 0
        ? Number(body.soldPrice)
        : undefined,
      listedAt: d(body.listedAt) ?? listing.outcome?.listedAt,
      soldAt: d(body.soldAt) ?? listing.outcome?.soldAt,
      updatedAt: new Date().toISOString(),
    },
  });
  return NextResponse.json(await getListing(userId, listing.id));
}
