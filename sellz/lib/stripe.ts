import Stripe from "stripe";
import type { Plan } from "./usage";

/**
 * Lazily constructed so the module can be imported (and the app can build)
 * without STRIPE_SECRET_KEY present. Billing routes fail with a clear message
 * instead of the whole process refusing to start.
 */
let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Billing isn't configured — STRIPE_SECRET_KEY is not set");
  }
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export const PLAN_PRICES: Record<Exclude<Plan, "free">, string | undefined> = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID,
};

/**
 * Map a Stripe price id back to a plan.
 *
 * The webhook must never infer the plan from anything the client sent — only
 * from what Stripe reports was actually purchased.
 */
export function planForPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return "free";
  if (priceId === PLAN_PRICES.pro) return "pro";
  if (priceId === PLAN_PRICES.business) return "business";
  return "free";
}
