import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

// Edge-safe config only — see the comment in auth.config.ts.
const { auth } = NextAuth(authConfig);

/**
 * Exact paths anyone may reach.
 *
 * /api/health is here because the platform healthcheck runs with no session —
 * behind the session check it would 401, the deploy would never be marked
 * healthy, and the release would roll back.
 */
const PUBLIC_PATHS = new Set(["/", "/pricing", "/login", "/signup", "/api/health"]);

/**
 * Path prefixes that authenticate themselves rather than by session:
 * - /api/auth/*      the sign-in flow itself
 * - /api/cron/*       machine-called, guarded by CRON_SECRET
 * - /api/stripe/webhook  Stripe signs the payload; it carries no session
 * - /api/research     dual-auth: a browser session OR the cron secret, decided
 *                     inside the route because both callers are legitimate
 * - /api/ebay/callback eBay redirects the browser here; the tenant travels in
 *                     a signed state parameter, not a session
 * - /api/inbound/email an email provider posts forwarded mail here with no
 *                     session; it is guarded by INBOUND_EMAIL_SECRET, and the
 *                     seller is identified by the token in the recipient
 *                     address. Note this is the webhook ONLY — the bare
 *                     /api/inbound route reads and applies sales for the
 *                     signed-in seller and must stay behind the session check.
 */
const SELF_GUARDED_PREFIXES = [
  "/api/auth/",
  "/api/cron/",
  "/api/stripe/webhook",
  "/api/research",
  "/api/ebay/callback",
  "/api/inbound/email",
];

/**
 * Serving one photo is public because eBay fetches listing images by URL and
 * cannot present a session — the unguessable id is the capability. Note this
 * matches only `/api/photos/<id>`; the bare `/api/photos` upload endpoint is
 * NOT public and stays behind the session check.
 */
const PUBLIC_PHOTO = /^\/api\/photos\/[^/]+$/;

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_PHOTO.test(pathname)) return true;
  return SELF_GUARDED_PREFIXES.some((p) => pathname.startsWith(p));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (req.auth?.user) return NextResponse.next();

  // API callers get a status they can act on; page requests get the login
  // screen with a return path so they land where they were headed.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const login = new URL("/login", req.nextUrl.origin);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
});

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
