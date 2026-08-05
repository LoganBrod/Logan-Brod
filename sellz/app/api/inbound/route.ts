import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getListing, updateListing } from "@/lib/store";

export const runtime = "nodejs";

/** Where forwarded mail should be sent. Unset means the feature is off. */
const DOMAIN = process.env.INBOUND_EMAIL_DOMAIN;

function addressFor(token: string | null): string | null {
  return token && DOMAIN ? `sale-${token}@${DOMAIN}` : null;
}

/** The seller's forwarding address plus anything waiting on a decision. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inboundToken: true },
  });

  const pending = await prisma.inboundSale.findMany({
    where: { userId, status: "pending" },
    orderBy: { receivedAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    configured: Boolean(DOMAIN),
    address: addressFor(user?.inboundToken ?? null),
    pending,
  });
}

/**
 * Mint the forwarding address.
 *
 * The token is the only thing standing between a stranger and writing sales
 * into this account, so it is 32 bytes of CSPRNG output and is generated once
 * — re-issuing would silently break a forwarding rule the seller already set.
 */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  if (!DOMAIN) {
    return NextResponse.json({ error: "Inbound email isn't set up on this server" }, { status: 503 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { inboundToken: true },
  });
  if (existing?.inboundToken) {
    return NextResponse.json({ address: addressFor(existing.inboundToken) });
  }

  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.user.update({ where: { id: userId }, data: { inboundToken: token } });
  return NextResponse.json({ address: addressFor(token) });
}

/**
 * Resolve a sale that couldn't be matched confidently: either point it at the
 * right listing, or throw it away.
 */
export async function PATCH(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const saleId = typeof body.saleId === "string" ? body.saleId : "";
  if (!saleId) return NextResponse.json({ error: "Which sale?" }, { status: 400 });

  // Scoped by userId as well as id, so one tenant cannot resolve another's row.
  const sale = await prisma.inboundSale.findFirst({ where: { id: saleId, userId } });
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.dismiss === true) {
    await prisma.inboundSale.update({ where: { id: sale.id }, data: { status: "dismissed" } });
    return NextResponse.json({ ok: true });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  const listing = listingId ? await getListing(userId, listingId) : null;
  if (!listing) return NextResponse.json({ error: "Pick a listing" }, { status: 400 });

  const soldAt = (sale.soldAt ?? new Date()).toISOString();
  await updateListing(userId, listing.id, {
    status: "sold",
    outcome: {
      views: listing.outcome?.views ?? 0,
      watchers: listing.outcome?.watchers ?? 0,
      offers: listing.outcome?.offers ?? 0,
      soldPrice: sale.price ?? listing.outcome?.soldPrice,
      listedAt: listing.outcome?.listedAt,
      soldAt,
      trafficHistory: listing.outcome?.trafficHistory,
      updatedAt: new Date().toISOString(),
    },
  });

  await prisma.inboundSale.update({
    where: { id: sale.id },
    data: { status: "applied", listingId: listing.id },
  });

  return NextResponse.json({ ok: true });
}
