import { put } from "@vercel/blob";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isAllowedPhotoType(type: string): boolean {
  return (ALLOWED_PHOTO_TYPES as readonly string[]).includes(type);
}

/**
 * Store one upload and hand back a URL Claude's vision call can fetch.
 *
 * These URLs are public — unguessable, but public, since the Messages API has
 * to reach them over the open internet. Fine for photos of clothing; worth
 * knowing before anyone uploads a photo of a person.
 */
export async function uploadPhoto(file: File): Promise<string> {
  if (!blobConfigured()) {
    throw new Error(
      "Photo upload is not configured. Add Vercel Blob (Vercel → Storage → Blob) so BLOB_READ_WRITE_TOKEN is set."
    );
  }
  if (!isAllowedPhotoType(file.type)) {
    throw new Error(`Unsupported image type: ${file.type || "unknown"}.`);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(`Image is larger than ${MAX_PHOTO_BYTES / 1024 / 1024}MB.`);
  }

  const { url } = await put(`closet/${file.name}`, file, {
    access: "public",
    // Random suffix keeps same-named uploads from clobbering each other and
    // makes URLs impractical to guess.
    addRandomSuffix: true,
    contentType: file.type,
  });

  return url;
}
