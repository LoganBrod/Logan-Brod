import { NextResponse } from "next/server";
import { COOKIE, passwordMatches, sessionToken, password } from "@/lib/auth";

export async function POST(req: Request) {
  if (!password()) return NextResponse.json({ ok: true });
  const { password: given } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!passwordMatches(String(given ?? ""))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.json({ error: "That is not it." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await sessionToken(), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 180 * 24 * 3600,
    secure: new URL(req.url).protocol === "https:",
  });
  return res;
}

export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0, secure: new URL(req.url).protocol === "https:" });
  return res;
}
