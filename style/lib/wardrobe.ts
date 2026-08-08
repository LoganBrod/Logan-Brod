// Where the wardrobe sits inside the loading clip's final frame.
//
// The results view doesn't draw a replica of the closet — it hangs garments
// over the video paused on its last frame, so the backdrop *is* the closet and
// there's no seam to misalign. That only works while these numbers match the
// footage, so they are measured, not guessed: edge detection over the 1280x720
// frame at t=2.75s, which `public/closet-building.*` is trimmed to end on.
//
// If the clip is ever re-cut, re-measure. Everything positional reads from here.

/** Fractions of the video frame, origin top-left. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The cabinet body. Garments must land inside this. */
export const CARCASS: Box = {
  left: 0.279,
  right: 0.722,
  top: 0.079,
  bottom: 0.892,
};

/** The vertical panel splitting the two bays. */
export const DIVIDER = 0.503;

/** The metal hanging rail, common to both bays. */
export const RAIL_Y = 0.263;

export interface Bay {
  name: string;
  left: number;
  right: number;
  /** Where a hanger's hook meets the rail. */
  railY: number;
  /** The surface below — the cabinet floor on the left, a shelf on the right. */
  floorY: number;
}

/**
 * Left hangs nearly twice as deep as right, which has a shelf and drawers under
 * it — so long pieces go left and short ones right, as they would in the real
 * thing.
 */
export const BAYS: Bay[] = [
  { name: "Long", left: 0.318, right: 0.503, railY: RAIL_Y, floorY: 0.892 },
  { name: "Short", left: 0.503, right: 0.710, railY: RAIL_Y, floorY: 0.596 },
];

export const bayWidth = (bay: Bay): number => bay.right - bay.left;
export const bayDrop = (bay: Bay): number => bay.floorY - bay.railY;

/**
 * Spread `count` garments along a bay, overlapping when there are more than the
 * rail comfortably fits. Clothes on a real rail touch; spacing them out evenly
 * looks like a shop display, and past four they wouldn't fit anyway.
 *
 * Returns each garment's centre as a fraction of the frame.
 *
 * `garmentW` is required because these are centres: inset by half a garment, or
 * the outermost pieces hang through the side of the cabinet.
 */
export function hangPositions(bay: Bay, count: number, garmentW: number): number[] {
  if (count <= 0) return [];

  const inset = garmentW / 2;
  const first = bay.left + inset;
  const last = bay.right - inset;

  if (count === 1 || last <= first) return [(bay.left + bay.right) / 2];

  const step = (last - first) / (count - 1);
  return Array.from({ length: count }, (_, i) => first + step * i);
}

/**
 * How wide one garment should be drawn, as a fraction of the frame.
 *
 * Sized so the pieces on a rail total slightly more than the bay — about 12%
 * overlap, the way clothes actually sit. Much more than that and neighbouring
 * garments merge into one shape; much less and it reads as a shop display.
 */
export function garmentWidth(bay: Bay, count: number): number {
  const width = bayWidth(bay);
  if (count <= 1) return width * 0.6;
  return Math.min(width * 0.55, (width * 1.12) / count);
}

/**
 * How far a garment hangs below the rail, as a fraction of the frame height.
 *
 * Taken from the bay's own depth rather than the image's aspect ratio: a card
 * sized by its photo leaves most of a full-height bay empty, which reads as
 * pictures pinned near a rail instead of clothes hanging from it.
 */
export function garmentHeight(bay: Bay): number {
  return bayDrop(bay) * 0.62;
}

/**
 * Deal items across the bays. The left bay is deeper, so it takes the first and
 * larger share; the right bay's rail is shorter and sits above a shelf.
 */
export function dealToBays<T>(items: T[]): T[][] {
  const leftShare = Math.ceil(items.length * 0.55);
  return [items.slice(0, leftShare), items.slice(leftShare)];
}
