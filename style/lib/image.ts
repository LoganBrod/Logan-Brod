// Browser-only: shrink a photo and hand back base64 for the Claude vision call.
//
// Sending the image inline means we don't need to host it anywhere, which is
// what Vercel Blob used to be for. It also keeps cost down — Opus 5 charges up
// to ~4.8k tokens for a full-resolution image, and the extra pixels buy nothing
// for reading a garment's cut and colour.

/** Opus 5 reads up to 2576px on the long edge; 1568 is plenty for clothing. */
const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.85;

/** Guard on the whole request — the API ceiling is 32MB, we stay well under. */
export const MAX_TOTAL_BASE64_BYTES = 12 * 1024 * 1024;

export interface EncodedPhoto {
  data: string;
  mediaType: "image/jpeg";
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't read "${file.name}" as an image.`));
    };
    img.src = url;
  });
}

export async function toDownscaledJpegBase64(file: File): Promise<EncodedPhoto> {
  const img = await loadImage(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process images (no canvas support).");

  // Photos of clothing are often shot on white; flatten transparency to white
  // rather than the black that JPEG would otherwise produce.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (!data) throw new Error(`Couldn't encode "${file.name}".`);

  return { data, mediaType: "image/jpeg" };
}

export async function encodePhotos(files: File[]): Promise<EncodedPhoto[]> {
  const encoded = await Promise.all(files.map(toDownscaledJpegBase64));

  const total = encoded.reduce((sum, photo) => sum + photo.data.length, 0);
  if (total > MAX_TOTAL_BASE64_BYTES) {
    throw new Error("Those photos are too large all together. Try fewer, or smaller ones.");
  }

  return encoded;
}
