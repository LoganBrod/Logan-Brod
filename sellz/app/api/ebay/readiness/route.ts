import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { checkPublishReadiness, missingPublishScopes } from "@/lib/ebay";
import { getEbayTokens } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

/**
 * Can this account publish, and if not, why?
 *
 * The reason matters: "reconnect eBay" and "set up business policies" are
 * completely different fixes, and previously every failure — including
 * permission errors — was reported as the latter, which sent people to the
 * wrong screen.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const tokens = await getEbayTokens(userId);

  if (!tokens) {
    return NextResponse.json(
      {
        connected: false,
        ready: false,
        reason: "not_connected",
        message: "Connect your eBay account on the Brain page first.",
        missing: [],
      },
      noStore
    );
  }

  const missingScopes = missingPublishScopes(tokens.grantedScopes);
  if (missingScopes.length > 0) {
    return NextResponse.json(
      {
        connected: true,
        ready: false,
        reason: "needs_reconnect",
        message:
          "This eBay connection was authorised before listing support was added, so it lacks the permissions needed to publish. Disconnect and reconnect on the Brain page to re-authorise.",
        missing: [],
      },
      noStore
    );
  }

  try {
    const readiness = await checkPublishReadiness(userId);
    return NextResponse.json(
      {
        connected: true,
        ...readiness,
        reason: readiness.ready ? "ready" : "missing_policies",
        message: readiness.ready
          ? "Ready to publish."
          : `eBay needs these on your seller account before it can publish: ${readiness.missing.join(", ")}. Set them up in My eBay → Account → Business Policies.`,
      },
      noStore
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Couldn't check your eBay account setup";
    const authIssue = /invalid_scope|re-authorise|reconnect|token|unauthor/i.test(detail);
    return NextResponse.json(
      {
        connected: true,
        ready: false,
        reason: authIssue ? "needs_reconnect" : "check_failed",
        message: detail,
        missing: [],
      },
      noStore
    );
  }
}
