// Photo selection rules, kept separate from the component so they can be tested.
//
// This logic previously lived inside a React state updater, where it read the
// browser's FileList lazily — by the time the updater ran, the input had been
// cleared and the list was empty, so only the very first selection ever landed.
// Callers must materialise the FileList into an array before calling in.

export const MAX_PHOTOS = 6;

/** What the vision API will accept, and therefore what a route will forward. */
export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface InlinePhoto {
  /** Raw base64, no data: prefix. */
  data: string;
  mediaType: string;
}

/**
 * The uploads as they arrive over the wire.
 *
 * Two routes take photos now — analyze reads them, and curate holds them up
 * against each candidate — so the shape check lives here rather than being
 * written twice and drifting. Anything malformed is dropped rather than
 * rejected: one unreadable entry out of six should not fail a run.
 */
export function parseInlinePhotos(raw: unknown, max: number = MAX_PHOTOS): InlinePhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is InlinePhoto => {
      if (!entry || typeof entry !== "object") return false;
      const photo = entry as Record<string, unknown>;
      return (
        typeof photo.data === "string" &&
        photo.data.length > 0 &&
        typeof photo.mediaType === "string" &&
        ALLOWED_MEDIA_TYPES.includes(photo.mediaType)
      );
    })
    .slice(0, max);
}

export interface PhotoSelection<T> {
  accepted: T[];
  /** Dropped for being over the cap — worth telling the user about. */
  rejectedForCap: number;
  /** Dropped for not being an image. */
  rejectedForType: number;
}

export function selectPhotos<T extends { type: string }>(
  existingCount: number,
  incoming: T[],
  max: number = MAX_PHOTOS
): PhotoSelection<T> {
  const images = incoming.filter((file) => file.type.startsWith("image/"));
  const room = Math.max(max - existingCount, 0);
  const accepted = images.slice(0, room);

  return {
    accepted,
    rejectedForCap: images.length - accepted.length,
    rejectedForType: incoming.length - images.length,
  };
}

export function describeRejections(selection: PhotoSelection<unknown>, max = MAX_PHOTOS): string | null {
  const parts: string[] = [];
  if (selection.rejectedForCap > 0) {
    parts.push(`${max} photos is the limit, so ${selection.rejectedForCap} didn't make it in`);
  }
  if (selection.rejectedForType > 0) {
    parts.push(
      `${selection.rejectedForType} ${selection.rejectedForType === 1 ? "file wasn't" : "files weren't"} an image`
    );
  }
  if (!parts.length) return null;
  return `${parts.join(", and ")}.`;
}
