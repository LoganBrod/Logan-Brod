// Runs before every request. With DASHBOARD_PASSWORD set, anyone without the session cookie is
// sent to /login (pages) or told 401 (APIs). Without it, this does nothing.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, isAuthed } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (await isAuthed(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "login required" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/|manifest\\.webmanifest|favicon\\.ico|icon|apple-icon).*)"],
};
