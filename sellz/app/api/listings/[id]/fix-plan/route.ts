import { NextRequest, NextResponse } from "next/server";
import { getListing } from "@/lib/store";
import { planFor } from "@/lib/fixPlan";
import { diagnose } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * What to fix on a weak listing, and — when the fix is textual — the rewrite
 * to approve. Photo problems can't be solved by a model, so those return the
 * plan alone and the seller adds the shots.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.status === "sold") {
    return NextResponse.json({ error: "This one sold — nothing to fix" }, { status: 409 });
  }

  const plan = planFor(listing);

  if (plan.kind === "photos") {
    return NextResponse.json({
      ...plan,
      photoCount: (listing.photos?.length ?? 0) + (listing.imageUrls?.length ?? 0),
    });
  }

  // A rewrite is a model call, so reuse a recent diagnosis rather than paying
  // for another one every time the panel is opened.
  const fresh =
    listing.diagnosis && Date.now() - Date.parse(listing.diagnosis.at) < 6 * 60 * 60 * 1000;
  try {
    const diagnosis = fresh ? listing.diagnosis! : await diagnose(listing.id);
    return NextResponse.json({
      ...plan,
      proposal: {
        title: diagnosis.rewrittenTitle,
        description: diagnosis.rewrittenDescription,
        price: diagnosis.suggestedPrice,
        why: diagnosis.text,
      },
      current: {
        title: listing.title,
        description: listing.description,
        price: listing.price,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't work out a fix" },
      { status: 502 }
    );
  }
}
