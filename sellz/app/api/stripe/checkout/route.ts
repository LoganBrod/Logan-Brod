import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, PLAN_PRICES } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Starts a Stripe Checkout session for one of our own plans.
 *
 * The client sends a plan name, not a price id: accepting a raw price id would
 * let anyone check out against an arbitrary (or cheaper) price. The id is
 * looked up server-side from env config.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const plan = body.plan === "pro" || body.plan === "business" ? body.plan : null;
  if (!plan) {
    return NextResponse.json({ error: "Pick a plan: pro or business" }, { status: 400 });
  }

  const priceId = PLAN_PRICES[plan as "pro" | "business"];
  if (!priceId) {
    return NextResponse.json(
      { error: `The ${plan} plan isn't configured on this deployment yet.` },
      { status: 503 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, stripeCustomerId: true },
  });

  const origin = process.env.PUBLIC_SITE_URL || req.nextUrl.origin;

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse the customer when we have one so a returning subscriber doesn't
      // accumulate duplicate Stripe customers.
      ...(user?.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : { customer_email: user?.email ?? undefined }),
      // The webhook trusts this over anything the browser reports.
      client_reference_id: userId,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
      success_url: `${origin}/settings/billing?success=true`,
      cancel_url: `${origin}/pricing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't start checkout" },
      { status: 502 }
    );
  }
}
