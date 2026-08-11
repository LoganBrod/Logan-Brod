import { NextResponse } from "next/server";
import {
  accountsConfigured,
  createLoginLink,
  endSession,
  looksLikeEmail,
  normalizeEmail,
  registerWithPassword,
  sessionCookie,
  setPassword,
  signInWithPassword,
  startSession,
} from "@/lib/accounts";
import { adoptLibrary } from "@/lib/library";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/passwords";
import { adoptTaste, readTasteId } from "@/lib/taste";
import { readViewer, tasteIdFor } from "@/lib/viewer";
import { mailConfigured, sendLoginLink } from "@/lib/mail";

export const dynamic = "force-dynamic";

/** GET /api/auth — who is signed in, and whether signing in is possible at all. */
export async function GET(req: Request) {
  const { user } = await readViewer(req);
  return NextResponse.json(
    {
      // Passwords need nothing but storage. A link needs a way to arrive, so
      // it can be off while passwords stay on — the UI hides what isn't there
      // rather than offering a control that can only fail.
      available: accountsConfigured(),
      links: mailConfigured() || process.env.NODE_ENV !== "production",
      minPasswordLength: MIN_PASSWORD_LENGTH,
      user: user ? { email: user.email } : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST /api/auth — sign in, create an account, or ask for a link.
 *
 *   { email, password }                  sign in
 *   { email, password, create: true }    create an account
 *   { email }                            email a link — also how you get back
 *                                        in without a password
 */
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

  let body: { email?: unknown; password?: unknown; create?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  // Everything built anonymously comes with you, whichever way you get in.
  const adopt = async (userId: string) => {
    const browserId = readTasteId(req.headers.get("cookie"));
    if (!browserId) return;
    await Promise.all([
      adoptLibrary({ kind: "user", id: userId }, { kind: "browser", id: browserId }),
      adoptTaste(browserId, tasteIdFor({ kind: "user", id: userId })),
    ]).catch(() => {});
  };

  if (typeof body.password === "string") {
    const problem = passwordProblem(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    try {
      if (body.create === true) {
        const created = await registerWithPassword(email, body.password);
        if (!created.ok) {
          return NextResponse.json(
            { error: "There's already an account for that address. Sign in instead." },
            { status: 409 }
          );
        }
        await adopt(created.user.id);
        const sid = await startSession(created.user.id);
        return NextResponse.json(
          { ok: true, user: { email: created.user.email } },
          { headers: { "Set-Cookie": sessionCookie(sid), "Cache-Control": "no-store" } }
        );
      }

      const result = await signInWithPassword(email, body.password);
      if (!result.ok) {
        if (result.reason === "rate-limited") {
          return NextResponse.json(
            { error: "Too many attempts. Wait a few minutes, or email yourself a link." },
            { status: 429 }
          );
        }
        if (result.reason === "no-password") {
          return NextResponse.json(
            {
              error:
                "That account doesn't have a password yet. Email yourself a link and set one after.",
            },
            { status: 409 }
          );
        }
        // Deliberately the same for a wrong password and an address with no
        // account: the form shouldn't answer "does this person have an account".
        return NextResponse.json(
          { error: "That email and password don't match." },
          { status: 401 }
        );
      }

      await adopt(result.user.id);
      const sid = await startSession(result.user.id);
      return NextResponse.json(
        { ok: true, user: { email: result.user.email } },
        { headers: { "Set-Cookie": sessionCookie(sid), "Cache-Control": "no-store" } }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't sign you in.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
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

/**
 * PUT /api/auth — set or change the password on the account you're signed in as.
 *
 * This is how someone who came in by link gets a password. Signing in is the
 * proof; there's no current-password check because holding a live session
 * already means holding the mailbox.
 */
export async function PUT(req: Request) {
  const { user } = await readViewer(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const problem = passwordProblem(body.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    await setPassword(user.id, body.password as string);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't set that password.";
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
