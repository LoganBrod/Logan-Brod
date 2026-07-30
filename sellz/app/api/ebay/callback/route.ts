import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/ebay";
import { decodeState } from "@/lib/oauthState";
import { publicOrigin } from "@/lib/origin";

export const runtime = "nodejs";

/**
 * eBay redirects here after the seller grants consent.
 *
 * Which tenant this is comes from the signed `state` parameter, not from a
 * session: eBay pins one callback URL per RuName for the whole app, and the
 * redirect is not guaranteed to carry our cookies. An unsigned state would
 * mean anyone could bind their eBay account to another seller's LevoZ account
 * by editing the URL, so a state we did not sign is rejected outright.
 */
export async function GET(req: NextRequest) {
  // These redirects are followed by the seller's browser, so they have to name
  // the app's public origin. `req.url` is the address the container itself is
  // listening on, which behind a proxy is something like localhost:8080 — a
  // real address on the *user's* machine, where the browser then fails to
  // connect. eBay redirects here from its own domain, so there is no earlier
  // navigation to fall back on.
  const origin = publicOrigin(req.nextUrl.origin);
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/brain?ebayError=${encodeURIComponent(msg)}`, origin));

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("No authorization code returned");

  const state = decodeState(req.nextUrl.searchParams.get("state"));
  if (!state) {
    return fail(
      "That eBay connection link was invalid or has expired. Start the connection again from the Brain page."
    );
  }

  try {
    await exchangeCodeForTokens(state.userId, code);
    return NextResponse.redirect(new URL("/brain?ebay=connected", origin));
  } catch (err) {
    return fail(err instanceof Error ? err.message : "eBay connection failed");
  }
}
