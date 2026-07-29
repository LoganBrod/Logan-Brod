import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing, updateListing, getEbayTokens } from "@/lib/store";
import { researchEbayComps } from "@/lib/ebay";
import { getPhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Stage 2: comparable eBay listings, matched on the photo where possible. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getEbayTokens(userId))) {
    return NextResponse.json({ error: "eBay account isn't connected" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const query =
    typeof body.query === "string" && body.query.trim() ? body.query.trim() : listing.title;

  // Front photo lets eBay match on the picture rather than our guessed wording
  let base64: string | undefined;
  const firstPhoto = listing.photos?.[0];
  if (firstPhoto) {
    const photo = await getPhoto(userId, firstPhoto);
    base64 = photo?.data.toString("base64");
  }

  try {
    const result = await researchEbayComps(userId, query, base64);
    if (result.comps.length > 0) {
      await updateListing(userId, listing.id, {
        comps: {
          summary: result.note,
          priceLow: result.priceLow,
          priceHigh: result.priceHigh,
          demandNotes: `${result.comps.length} comparable listings found${
            result.soldDataAvailable ? ", including confirmed sold prices" : ""
          }.`,
          sources: result.comps
            .map((c) => c.url)
            .filter((u): u is string => Boolean(u))
            .slice(0, 5),
          manualNotes: listing.comps?.manualNotes,
          at: new Date().toISOString(),
        },
      });
    }
    return NextResponse.json({
      note: result.note,
      soldDataAvailable: result.soldDataAvailable,
      visualMatchCount: result.visualMatchCount,
      suggestedPrice: result.suggestedPrice,
      priceLow: result.priceLow,
      priceHigh: result.priceHigh,
      top: result.comps.slice(0, 8),
      compLines: result.comps.slice(0, 12).map((c) => ({
        sold: c.sold,
        price: c.price,
        title: c.title,
        sellerFeedbackPct: c.sellerFeedbackPct,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Comps lookup failed" },
      { status: 502 }
    );
  }
}
