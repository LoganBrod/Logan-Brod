import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addListing, listListings, type Listing } from "@/lib/store";
import { scoreListing } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listListings());
}

/** Import an existing listing (sold, active, or stuck). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const s = (v: unknown, max: number, fallback = "") =>
    typeof v === "string" ? v.trim().slice(0, max) : fallback;
  const n = (v: unknown) => (isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);

  const title = s(body.title, 200);
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const status = ["draft", "active", "sold", "stale", "ended"].includes(body.status)
    ? body.status
    : "active";

  const listing: Listing = {
    id: crypto.randomUUID().slice(0, 8),
    platform: ["ebay", "depop", "other"].includes(body.platform) ? body.platform : "other",
    title,
    description: s(body.description, 4000),
    price: n(body.price),
    category: s(body.category, 100),
    condition: s(body.condition, 200),
    tags: s(body.tags, 300)
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean)
      .slice(0, 8),
    photosNote: s(body.photosNote, 500),
    status,
    source: "imported",
    experimentId: "control",
    createdAt: new Date().toISOString(),
  };

  if (body.outcome && typeof body.outcome === "object") {
    listing.outcome = {
      views: n(body.outcome.views),
      watchers: n(body.outcome.watchers),
      offers: n(body.outcome.offers),
      soldPrice:
        status === "sold" && isFinite(Number(body.outcome.soldPrice))
          ? Number(body.outcome.soldPrice)
          : undefined,
      listedAt: typeof body.outcome.listedAt === "string" ? body.outcome.listedAt : undefined,
      soldAt: typeof body.outcome.soldAt === "string" ? body.outcome.soldAt : undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  addListing(listing);
  if (listing.status === "draft") void scoreListing(listing.id);
  return NextResponse.json(listing);
}
