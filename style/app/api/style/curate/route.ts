import { NextResponse } from "next/server";
import { curate } from "@/lib/curate";
import { buildOutfits } from "@/lib/outfits";
import { StyleProfileSchema } from "@/lib/schemas";
import type { ProductListing } from "@/lib/sources/types";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST /api/style/curate
 *
 * Runs pass 2 (score and filter) then pass 3 (assemble outfits) in sequence —
 * outfits are drawn from what curation kept, so they can't be parallel.
 *
 * `?outfits=0` runs curation only, for regenerating the grid on its own.
 */
export async function POST(req: Request) {
  const withOutfits = new URL(req.url).searchParams.get("outfits") !== "0";

  let body: { profile?: unknown; candidates?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsedProfile = StyleProfileSchema.safeParse(body.profile);
  if (!parsedProfile.success) {
    return NextResponse.json(
      { error: "profile is missing or malformed; re-run the analyze step." },
      { status: 400 }
    );
  }

  const candidates = Array.isArray(body.candidates)
    ? (body.candidates as ProductListing[]).filter(
        (c) => c && typeof c.id === "string" && typeof c.title === "string"
      )
    : [];

  if (!candidates.length) {
    return NextResponse.json({ error: "candidates must be a non-empty array." }, { status: 400 });
  }

  try {
    const curation = await curate(parsedProfile.data, candidates);
    const outfits =
      withOutfits && curation.items.length
        ? await buildOutfits(parsedProfile.data, curation.items)
        : [];

    return NextResponse.json(
      { items: curation.items, notes: curation.notes, outfits },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
