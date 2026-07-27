import { NextRequest, NextResponse } from "next/server";
import { getPhoto } from "@/lib/photos";

export const runtime = "nodejs";

/** Serves a stored photo. Public by design — eBay fetches these URLs. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[a-z0-9]{1,40}$/i.test(params.id)) {
    return NextResponse.json({ error: "Bad photo id" }, { status: 400 });
  }
  const photo = await getPhoto(params.id);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
