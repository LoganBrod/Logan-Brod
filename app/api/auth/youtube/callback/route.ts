// Google OAuth callback: exchanges the code for tokens and stores the
// refresh token in an httpOnly cookie (no database needed).
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/diagnostics?auth_error=${reason}`, origin));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("yt_oauth_state")?.value;

  if (req.nextUrl.searchParams.get("error")) return fail("consent_denied");
  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("state_mismatch");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: `${origin}/api/auth/youtube/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.refresh_token) {
    console.error("token exchange failed:", tokens);
    return fail("token_exchange_failed");
  }

  const res = NextResponse.redirect(new URL("/diagnostics?connected=1", origin));
  res.cookies.set("yt_refresh_token", tokens.refresh_token, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 180 * 24 * 60 * 60, // 180 days
    path: "/",
  });
  res.cookies.delete("yt_oauth_state");
  return res;
}
