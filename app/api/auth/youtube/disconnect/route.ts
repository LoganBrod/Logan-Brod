// Disconnects the YouTube deep-dive connection: revokes the token at Google
// and clears the cookie.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("yt_refresh_token")?.value;
  if (token) {
    // Best-effort revoke; the cookie is cleared regardless
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("yt_refresh_token");
  return res;
}
