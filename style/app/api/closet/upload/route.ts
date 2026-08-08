import { NextResponse } from "next/server";
import { MAX_PHOTO_BYTES, uploadPhoto } from "@/lib/blob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PHOTOS = 6;

/** POST multipart/form-data with one or more `photos` fields. */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data body." },
      { status: 400 }
    );
  }

  const files = form
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!files.length) {
    return NextResponse.json({ error: "No photos were uploaded." }, { status: 400 });
  }
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Upload at most ${MAX_PHOTOS} photos.` },
      { status: 400 }
    );
  }

  const oversized = files.find((f) => f.size > MAX_PHOTO_BYTES);
  if (oversized) {
    return NextResponse.json(
      { error: `"${oversized.name}" is over ${MAX_PHOTO_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }

  try {
    const photoUrls = await Promise.all(files.map(uploadPhoto));
    return NextResponse.json({ photoUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
