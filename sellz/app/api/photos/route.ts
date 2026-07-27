import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { savePhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Upload one item photo. Returns its id; the image is served at /api/photos/[id]. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const contentType = file.type || "image/jpeg";
  if (!ALLOWED.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${contentType}` },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 8MB" }, { status: 400 });
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  try {
    await savePhoto(id, bytes, contentType);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't save the photo" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id, url: `/api/photos/${id}`, contentType });
}
