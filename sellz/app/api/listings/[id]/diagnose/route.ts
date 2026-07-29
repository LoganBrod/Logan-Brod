import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getListing } from "@/lib/store";
import { diagnose } from "@/lib/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Why isn't this selling — analysis + rewritten listing. */
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
  if (listing.status === "sold") {
    return NextResponse.json({ error: "This one sold — nothing to fix" }, { status: 409 });
  }
  try {
    await diagnose(userId, listing.id);
    return NextResponse.json(await getListing(userId, listing.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Diagnosis failed" },
      { status: 502 }
    );
  }
}
