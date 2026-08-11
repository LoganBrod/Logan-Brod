import { NextResponse } from "next/server";
import {
  accountsConfigured,
  createLoginLink,
  endSession,
  looksLikeEmail,
  normalizeEmail,
  sessionCookie,
} from "@/lib/accounts";
import { mailConfigured, sendLoginLink } from "@/lib/mail";
import { readTasteId } from "@/lib/taste";
import { readViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** GET /api/auth — who is signed in, and whether signing in is possible at all. */
export async function GET(req: Request) {
  const { user } = await readViewer(req);
  return NextResponse.json(
    {
      // Both have to be true before the UI offers a sign-in form: an account
      // needs somewhere to live and a link needs a way to arrive.
      available: accountsConfigured() && (mailConfigured() || process.env.NODE_ENV !== "production"),
      user: user ? { email: user.email } : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** POST /api/auth — ask for a sign-in link. */
export async function POST(req: Request) {
  if (!accountsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Accounts aren't set up. Add Upstash Redis (Vercel → Storage → Marketplace) to sign in.",
      },
      { status: 501 }
    );
  }

  let body: { email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  try {
    const origin = new URL(req.url).origin;
    const link = await createLoginLink(email, origin, readTasteId(req.headers.get("cookie")));

    if ("rateLimited" in link) {
      return NextResponse.json(
        { error: "That address has been sent several links already. Try again in an hour." },
        { status: 429 }
      );
    }

    const delivery = await sendLoginLink(email, link.url);

    // `logged` only happens outside production, where the link goes to the
    // server console instead. Saying so is the difference between a working
    // dev setup and someone waiting on an email that was never sent.
    return NextResponse.json(
      { ok: true, delivery },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't send that link.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** DELETE /api/auth — sign out. */
export async function DELETE(req: Request) {
  await endSession(req.headers.get("cookie"));
  return NextResponse.json(
    { ok: true },
    // Max-Age 0 clears it. Same attributes as when it was set, or the browser
    // treats it as a different cookie and leaves the original in place.
    { headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } }
  );
}
