import { NextResponse } from "next/server";
import { consumeLoginLink, sessionCookie, startSession } from "@/lib/accounts";
import { adoptLibrary } from "@/lib/library";
import { adoptTaste, readTasteId } from "@/lib/taste";
import { tasteIdFor } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/callback?token=… — the link in the email.
 *
 * Redirects rather than returning JSON, because this is opened by a person in a
 * browser, not by the app. A spent, expired, or invented token all land on the
 * same page with the same message; distinguishing them would only tell someone
 * poking at links which of their guesses was closest.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  const result = await consumeLoginLink(token).catch(() => null);
  if (!result) {
    return NextResponse.redirect(new URL("/?signin=expired", url.origin));
  }

  const { user, tasteId } = result;

  // Everything built before signing in comes along. The browser id is taken
  // from the link where possible — the person may well be finishing this on a
  // different device than the one that asked — and from the current cookie
  // otherwise.
  const browserId = tasteId ?? readTasteId(req.headers.get("cookie"));
  if (browserId) {
    await Promise.all([
      adoptLibrary({ kind: "user", id: user.id }, { kind: "browser", id: browserId }),
      adoptTaste(browserId, tasteIdFor({ kind: "user", id: user.id })),
    ]);
  }

  const sid = await startSession(user.id);
  return NextResponse.redirect(new URL("/closet/saved?signin=ok", url.origin), {
    headers: { "Set-Cookie": sessionCookie(sid), "Cache-Control": "no-store" },
  });
}
