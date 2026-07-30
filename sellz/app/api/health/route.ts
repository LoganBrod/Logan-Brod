import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness probe for the host's healthcheck.
 *
 * Deliberately does not touch Postgres. A healthcheck is what decides whether
 * a new deploy is allowed to take traffic, so making it depend on the database
 * means a transient Supabase blip fails an otherwise good release and rolls it
 * back. This answers only "is the server up and serving?", which is the one
 * question the platform is actually asking.
 *
 * Use /api/health?deep=1 to additionally check the database — useful when
 * debugging by hand, and never wired into the platform healthcheck.
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  if (!deep) {
    return NextResponse.json({ ok: true, service: "levoz" });
  }

  // Imported lazily so the plain liveness path never pulls in Prisma.
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "levoz", database: "up" });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        service: "levoz",
        database: "down",
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 }
    );
  }
}
