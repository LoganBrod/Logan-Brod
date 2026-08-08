// Where the wardrobe sits inside the loading clip's final frame.
//
// The results view doesn't draw a replica of the closet — it hangs garments
// over the video paused on its last frame, so the backdrop *is* the closet and
// there's no seam to misalign. That only works while these numbers match the
// footage, so they are measured, not guessed: edge detection over the final
// frame of `public/closet-building.*`, which already ends with the doors open.
//
// If the clip is ever recut or replaced, re-measure. Everything positional
// reads from here, and the browser check asserts every garment lands inside
// CARCASS — that assertion is what catches a stale measurement.

/** Fractions of the video frame, origin top-left. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The open cavity. Garments must land inside this. */
export const CARCASS: Box = {
  left: 0.282,
  right: 0.718,
  top: 0.089,
  bottom: 0.868,
};

/** The hanging rail, running the full width of the cavity. */
export const RAIL_Y = 0.303;

/** The floor of the cavity — how far a garment can hang. */
export const FLOOR_Y = 0.868;

/**
 * One wide rail, no divider and no drawers. The previous wardrobe split into
 * two bays of differing depth, which forced long pieces left and short pieces
 * right; this one is a single volume more than twice as wide, so everything
 * hangs in one row.
 */
export const RAIL = {
  left: CARCASS.left + 0.014,
  right: CARCASS.right - 0.014,
  y: RAIL_Y,
  floorY: FLOOR_Y,
};

export const railWidth = (): number => RAIL.right - RAIL.left;
export const railDrop = (): number => RAIL.floorY - RAIL.y;

/**
 * How wide one garment bag should be drawn, as a fraction of the frame.
 *
 * Sized so the pieces total slightly more than the rail — about 10% overlap,
 * the way clothes actually sit. Capped so two or three pieces don't inflate
 * into slabs.
 */
export function bagWidth(count: number): number {
  const width = railWidth();
  if (count <= 1) return width * 0.22;
  return Math.min(width * 0.2, (width * 1.1) / count);
}

/**
 * How far a bag hangs below the rail, as a fraction of the frame height.
 * Taken from the cavity's depth rather than any photo's aspect ratio — a bag
 * sized by its contents would jump around as the photos change.
 */
export function bagHeight(): number {
  return railDrop() * 0.78;
}

/**
 * Spread `count` garments along the rail. These are centres, so the ends are
 * inset by half a bag or the outermost pieces hang through the cabinet side.
 */
export function hangPositions(count: number, garmentW: number): number[] {
  if (count <= 0) return [];

  const inset = garmentW / 2;
  const first = RAIL.left + inset;
  const last = RAIL.right - inset;

  if (count === 1 || last <= first) return [(RAIL.left + RAIL.right) / 2];

  const step = (last - first) / (count - 1);
  return Array.from({ length: count }, (_, i) => first + step * i);
}
