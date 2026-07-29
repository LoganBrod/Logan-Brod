import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MIN_PASSWORD = 10;

/**
 * Email/password signup. Public by necessity — this is how an account comes
 * to exist, so it cannot require a session.
 *
 * Google sign-in is the primary path; this exists for people who don't want
 * to use it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Use at least ${MIN_PASSWORD} characters for your password` },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (existing) {
    // Deliberately the same message whether the address is taken by a
    // password account or a Google one: distinguishing them would confirm to
    // a stranger which emails have accounts here.
    return NextResponse.json(
      { error: "That email can't be used. Try signing in instead." },
      { status: 409 }
    );
  }

  await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  // No session is issued here — the client signs in immediately afterwards, so
  // there is exactly one code path that creates a session.
  return NextResponse.json({ ok: true });
}
