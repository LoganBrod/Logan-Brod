import { NextRequest, NextResponse } from "next/server";
import { getListing } from "@/lib/store";
import { diagnose } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Why isn't this selling — analysis + rewritten listing. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.status === "sold") {
    return NextResponse.json({ error: "This one sold — nothing to fix" }, { status: 409 });
  }
  try {
    await diagnose(listing.id);
    return NextResponse.json(getListing(listing.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Diagnosis failed" },
      { status: 502 }
    );
  }
}
