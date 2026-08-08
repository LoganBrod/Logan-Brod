import { NextResponse } from "next/server";
import {
  CLOSET_COOKIE,
  CLOSET_TTL_SECONDS,
  createCloset,
  isValidCode,
  normalizeCode,
  readCloset,
  updateCloset,
  type ClosetDraft,
} from "@/lib/closet";
import { redisConfigured } from "@/lib/redis";
import { StyleProfileSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

function cookieHeader(code: string): string {
  // httpOnly so page JS can't read it; the code is also returned in the body,
  // which is what the UI displays.
  return [
    `${CLOSET_COOKIE}=${code}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${CLOSET_TTL_SECONDS}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function parseDraft(body: unknown): ClosetDraft | { error: string } {
  const raw = body as Record<string, unknown> | null;
  if (!raw) return { error: "Body must be JSON." };

  const profile = StyleProfileSchema.safeParse(raw.profile);
  if (!profile.success) return { error: "profile is missing or malformed." };

  const range = raw.range as { min?: unknown; max?: unknown } | undefined;
  const min = Number(range?.min);
  const max = Number(range?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    return { error: "range.min and range.max must be numbers with 0 <= min < max." };
  }

  return {
    range: { min, max },
    profile: profile.data,
    items: Array.isArray(raw.items) ? (raw.items as ClosetDraft["items"]) : [],
    outfits: Array.isArray(raw.outfits) ? (raw.outfits as ClosetDraft["outfits"]) : [],
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
  };
}

/** GET /api/closet?code=ABC123 — falls back to the cookie when no code is given. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fromQuery = searchParams.get("code");
  const fromCookie = req.headers
    .get("cookie")
    ?.match(new RegExp(`${CLOSET_COOKIE}=([^;]+)`))?.[1];

  const code = normalizeCode(fromQuery ?? fromCookie ?? "");
  if (!code) {
    return NextResponse.json({ error: "No closet code supplied." }, { status: 400 });
  }
  if (!isValidCode(code)) {
    return NextResponse.json({ error: "That isn't a valid closet code." }, { status: 400 });
  }

  try {
    const closet = await readCloset(code);
    if (!closet) {
      return NextResponse.json(
        { error: "No closet found for that code. It may have expired." },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { closet },
      { headers: { "Set-Cookie": cookieHeader(code), "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** POST /api/closet — creates a closet, or updates one when `code` is supplied. */
export async function POST(req: Request) {
  // 501, not 502: saving is an optional feature that hasn't been set up, which
  // the client treats as "carry on without a code" rather than a failure.
  if (!redisConfigured()) {
    return NextResponse.json(
      {
        error:
          "Saving isn't set up. Add Upstash Redis (Vercel → Storage → Marketplace) to keep closets between visits.",
      },
      { status: 501 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const draft = parseDraft(body);
  if ("error" in draft) {
    return NextResponse.json({ error: draft.error }, { status: 400 });
  }

  const requestedCode = normalizeCode(
    (body as { code?: string }).code ?? ""
  );

  try {
    const closet = requestedCode
      ? await updateCloset(requestedCode, draft)
      : await createCloset(draft);

    if (!closet) {
      return NextResponse.json(
        { error: "No closet found for that code. It may have expired." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { closet },
      { headers: { "Set-Cookie": cookieHeader(closet.code), "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
