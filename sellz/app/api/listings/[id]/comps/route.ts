import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing } from "@/lib/store";
import { researchComps } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Web-research what comparable items sell for. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const listing = await getListing(userId, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await researchComps(userId, listing.id);
    return NextResponse.json(await getListing(userId, listing.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Comps research failed" },
      { status: 502 }
    );
  }
}
