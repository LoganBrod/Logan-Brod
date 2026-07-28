import { NextRequest, NextResponse } from "next/server";
import { getListing, updateListing } from "@/lib/store";
import { researchRetail } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Stage 3: what the item cost new and why buyers want it. Separate request
 * because this one uses web search and is the slowest step in the pipeline.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const query =
    typeof body.query === "string" && body.query.trim() ? body.query.trim() : listing.title;
  const compTitles: string[] = Array.isArray(body.compTitles)
    ? body.compTitles.filter((t: unknown) => typeof t === "string").slice(0, 8)
    : [];

  try {
    const retail = await researchRetail(query, compTitles);
    if (retail) {
      await updateListing(listing.id, {
        retail: { ...retail, at: new Date().toISOString() },
      });
    }
    return NextResponse.json(retail ?? null);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Retail research failed" },
      { status: 502 }
    );
  }
}
