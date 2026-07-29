import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, planForPriceId } from "@/lib/stripe";

export const runtime = "nodejs";
// The signature is computed over the exact bytes Stripe sent, so the body must
// not be parsed or re-serialised before verification.
export const dynamic = "force-dynamic";

/**
 * Stripe's view of the subscription is the source of truth for a user's plan.
 *
 * Nothing here trusts the request body until the signature has been verified —
 * an unverified webhook is an open endpoint for granting yourself a paid plan.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.userId;
        if (!userId) break;

        // Read the plan back off the subscription rather than the metadata, so
        // the recorded plan is what Stripe actually billed for.
        let plan = session.metadata?.plan === "business" ? "business" : "pro";
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe().subscriptions.retrieve(subscriptionId);
          plan = planForPriceId(sub.items.data[0]?.price?.id);
        }

        await prisma.user.update({
          where: { id: userId },
          data: {
            plan,
            stripeCustomerId:
              typeof session.customer === "string" ? session.customer : session.customer?.id,
            stripeSubscriptionId: subscriptionId ?? null,
            // A new paid period starts a fresh allowance.
            listingsUsedThisMonth: 0,
            aiCallsUsedThisMonth: 0,
            usageResetAt: new Date(),
          },
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const plan = planForPriceId(sub.items.data[0]?.price?.id);
        // A subscription that is past_due or unpaid should not keep paid
        // features; only an active-ish one does.
        const entitled = ["active", "trialing"].includes(sub.status) ? plan : "free";
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { plan: entitled },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { plan: "free", stripeSubscriptionId: null },
        });
        break;
      }

      case "invoice.payment_failed": {
        // Left as a no-op on purpose: Stripe retries on its own schedule and
        // emits subscription.updated when the status actually changes. Dropping
        // someone to free on a single failed charge would cut off a paying
        // customer over a temporary card decline.
        break;
      }
    }
  } catch (err) {
    // Return 500 so Stripe retries rather than treating a failed write as done.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook handling failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
