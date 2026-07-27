import fs from "fs";
import path from "path";
import { getStore } from "@netlify/blobs";
import { DATA_DIR, ensureDirs } from "./paths";

/**
 * Item photos. Same storage split as lib/db.ts: Netlify Blobs when deployed,
 * local files in ./data/photos otherwise. Photos are served back out through
 * /api/photos/[id] so they have public HTTPS URLs — eBay fetches images by
 * URL when publishing a listing, so they can't live only on disk.
 */
const useBlobs = Boolean(
  process.env.SITE_ID || process.env.NETLIFY_SITE_ID || process.env.NETLIFY_BLOBS_CONTEXT
);

const PHOTO_STORE_NAME = "levoz-photos";
const PHOTO_DIR = path.join(DATA_DIR, "photos");

function blobStore() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: PHOTO_STORE_NAME, consistency: "strong", siteID, token });
  }
  return getStore({ name: PHOTO_STORE_NAME, consistency: "strong" });
}

export interface StoredPhoto {
  data: Buffer;
  contentType: string;
}

export async function savePhoto(id: string, data: Buffer, contentType: string): Promise<void> {
  if (useBlobs) {
    // Blobs takes ArrayBuffer/Blob, not Node's Buffer
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    await blobStore().set(id, ab, { metadata: { contentType } });
    return;
  }
  ensureDirs();
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.writeFileSync(path.join(PHOTO_DIR, id), data);
  fs.writeFileSync(path.join(PHOTO_DIR, `${id}.type`), contentType);
}

export async function getPhoto(id: string): Promise<StoredPhoto | null> {
  if (useBlobs) {
    const res = await blobStore().getWithMetadata(id, { type: "arrayBuffer" });
    if (!res) return null;
    return {
      data: Buffer.from(res.data as ArrayBuffer),
      contentType: (res.metadata?.contentType as string) || "image/jpeg",
    };
  }
  try {
    const data = fs.readFileSync(path.join(PHOTO_DIR, id));
    let contentType = "image/jpeg";
    try {
      contentType = fs.readFileSync(path.join(PHOTO_DIR, `${id}.type`), "utf8");
    } catch {
      /* default */
    }
    return { data, contentType };
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  if (useBlobs) {
    await blobStore().delete(id);
    return;
  }
  try {
    fs.unlinkSync(path.join(PHOTO_DIR, id));
    fs.unlinkSync(path.join(PHOTO_DIR, `${id}.type`));
  } catch {
    /* already gone */
  }
}

/** Absolute, publicly reachable URL for a stored photo (needed by eBay). */
export function photoUrl(id: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/photos/${id}`;
}
