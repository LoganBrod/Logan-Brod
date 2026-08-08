import { NextResponse } from "next/server";
import { curate } from "@/lib/curate";
import { StyleProfileSchema } from "@/lib/schemas";
import type { ProductListing } from "@/lib/sources/types";

export const dynamic = "force-dynamic";
// Curation looks at every candidate's photo, so this is the slowest pass.
export const maxDuration = 180;

/** POST /api/style/curate — scores candidates against the profile and filters. */
export async function POST(req: Request) {
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
    return NextResponse.json(
      { items: curation.items, notes: curation.notes },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
