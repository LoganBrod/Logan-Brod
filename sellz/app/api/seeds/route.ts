import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import crypto from "crypto";
import { addSeedListing, deleteSeedListing, listSeedListings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  return NextResponse.json(await listSeedListings(userId));
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 600) : "";
  if (description.length < 10) {
    return NextResponse.json(
      { error: "Describe the listing — item, title style, price, how fast it sold" },
      { status: 400 }
    );
  }
  await addSeedListing(userId, {
    id: crypto.randomUUID(),
    description,
    source: typeof body.source === "string" ? body.source.trim().slice(0, 300) : undefined,
    stats: typeof body.stats === "string" ? body.stats.trim().slice(0, 100) : undefined,
    addedAt: new Date().toISOString(),
  });
  return NextResponse.json(await listSeedListings(userId));
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteSeedListing(userId, id);
  return NextResponse.json(await listSeedListings(userId));
}
