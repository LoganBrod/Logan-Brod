import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Opens Stripe's own billing portal, where the seller can change payment
 * method, switch plan, or cancel. Deliberately not reimplemented here —
 * card handling and cancellation flows are Stripe's job.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No subscription to manage yet — pick a plan first." },
      { status: 400 }
    );
  }

  const origin = process.env.PUBLIC_SITE_URL || req.nextUrl.origin;
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/settings/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't open the billing portal" },
      { status: 502 }
    );
  }
}
