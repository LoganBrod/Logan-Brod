import { NextRequest, NextResponse } from "next/server";
import { getListing } from "@/lib/store";
import { scoreListing } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const score = await scoreListing(listing.id);
    if (!score) {
      return NextResponse.json(
        { error: "Scoring needs ANTHROPIC_API_KEY set in .env.local" },
        { status: 400 }
      );
    }
    return NextResponse.json(getListing(listing.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scoring failed" },
      { status: 502 }
    );
  }
}
