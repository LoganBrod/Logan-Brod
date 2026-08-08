// Photo selection rules, kept separate from the component so they can be tested.
//
// This logic previously lived inside a React state updater, where it read the
// browser's FileList lazily — by the time the updater ran, the input had been
// cleared and the list was empty, so only the very first selection ever landed.
// Callers must materialise the FileList into an array before calling in.

export const MAX_PHOTOS = 6;

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
