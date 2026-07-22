import { NextRequest, NextResponse } from "next/server";
import { getListing } from "@/lib/store";
import { researchComps } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Web-research what comparable items sell for. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await researchComps(listing.id);
    return NextResponse.json(await getListing(listing.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Comps research failed" },
      { status: 502 }
    );
  }
}
