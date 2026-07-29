import { NextRequest } from "next/server";
import { prisma } from "./prisma";

/**
 * Gate for the scheduled endpoints.
 *
 * Deliberately fails closed. The old single-tenant version wrapped this check
 * in `if (CRON_SECRET)`, which left the endpoint wide open whenever the
 * variable was unset — tolerable when it could only ever touch one person's
 * own listings, unacceptable now that these routes act on every tenant.
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Sellers a scheduled job should consider.
 *
 * Only users who have actually connected eBay — everything the crons do needs
 * live tokens, so anyone else is a wasted iteration.
 */
export async function tenantsWithEbay(): Promise<string[]> {
  const rows = await prisma.ebayTokens.findMany({ select: { userId: true } });
  return rows.map((r) => r.userId);
}
