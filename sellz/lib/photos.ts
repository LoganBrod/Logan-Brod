import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "./prisma";

/**
 * Listing photos, stored in Cloudflare R2 through its S3-compatible API.
 *
 * R2 rather than S3 because eBay re-fetches listing images by URL for the
 * whole life of a listing, and R2 charges nothing for egress.
 *
 * The bucket stays private: `photoUrl` hands out our own /api/photos/[id]
 * path rather than a storage URL, and that route streams the object. So keys
 * are never public and the ownership check stays in one place.
 */
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.R2_BUCKET || "levoz-photos";

export interface StoredPhoto {
  data: Buffer;
  contentType: string;
}

/** Objects are namespaced per seller, so one tenant's prefix is a clean unit. */
function keyFor(userId: string, id: string): string {
  return `${userId}/${id}`;
}

export async function savePhoto(
  userId: string,
  id: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: keyFor(userId, id),
      Body: data,
      ContentType: contentType,
    })
  );
  // This row is what lets the public GET resolve an owner from the id alone.
  // Written after the upload, so a failed upload never leaves a row pointing
  // at an object that isn't there.
  await prisma.photo.upsert({
    where: { id },
    create: { id, userId, contentType },
    update: { userId, contentType },
  });
}

export async function getPhoto(userId: string, id: string): Promise<StoredPhoto | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: keyFor(userId, id) })
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return {
      data: Buffer.from(bytes),
      contentType: res.ContentType || "image/jpeg",
    };
  } catch {
    // A miss and a permissions failure are both "no photo" to every caller.
    return null;
  }
}

/**
 * Resolve a photo id to its owner.
 *
 * Needed by the public GET route: eBay fetches image URLs with no session, so
 * that route cannot learn the tenant from the request. The id is an
 * unguessable random string and is therefore the capability; this turns it
 * into the owner needed to build the object key, without ever putting the
 * userId in a URL that gets handed to a third party.
 */
export async function getPhotoOwner(id: string): Promise<string | null> {
  const row = await prisma.photo.findUnique({ where: { id }, select: { userId: true } });
  return row?.userId ?? null;
}

/** Fetch by id alone, resolving the owner first. For the public route only. */
export async function getPhotoById(id: string): Promise<StoredPhoto | null> {
  const userId = await getPhotoOwner(id);
  if (!userId) return null;
  return getPhoto(userId, id);
}

export async function deletePhoto(userId: string, id: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyFor(userId, id) }));
  await prisma.photo.deleteMany({ where: { id, userId } });
}

/**
 * The URL handed to eBay. Deliberately unchanged in shape from the pre-R2
 * version: eBay stores these URLs against live listings, so altering the
 * pattern would break the images on every listing already published.
 */
export function photoUrl(id: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/photos/${id}`;
}
