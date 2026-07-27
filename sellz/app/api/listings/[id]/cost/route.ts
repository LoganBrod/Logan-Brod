import { NextRequest, NextResponse } from "next/server";
import { getListing, updateListing } from "@/lib/store";

export const runtime = "nodejs";

/** Record what an item cost to acquire and ship — the basis for profit. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // Undefined (rather than 0) when left blank, so "unknown cost" stays
  // distinguishable from "genuinely free".
  const money = (v: unknown): number | undefined => {
    if (v === "" || v === null || v === undefined) return undefined;
    const n = Number(v);
    return isFinite(n) && n >= 0 ? n : undefined;
  };

  await updateListing(listing.id, {
    cost: {
      purchasePrice: money(body.purchasePrice),
      shippingCost: money(body.shippingCost),
      fees: money(body.fees),
      source: typeof body.source === "string" ? body.source.trim().slice(0, 120) : undefined,
      updatedAt: new Date().toISOString(),
    },
  });
  return NextResponse.json(await getListing(listing.id));
}
