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

/** The clip is 1280x720, and every fraction below is read against that shape. */
export const FRAME_ASPECT = 16 / 9;

/**
 * A bag's height over its width, as drawn on screen.
 *
 * This is the number that decides whether the photo inside looks like anything.
 * A bag is filled with `object-contain`, so a roughly square product shot is
 * fitted to whichever side is tighter — make the bag a tall sliver and the photo
 * shrinks to its width and floats in a column of white. Just taller than wide
 * still reads as a garment bag while leaving a square photo nearly filling it.
 */
const BAG_RATIO = 1.2;

/**
 * The widest a bag is ever drawn, as a fraction of the frame. Without a cap,
 * three pieces would each be a third of the wardrobe.
 */
const MAX_BAG_W = 0.11;

/** Air between the two rails, so the upper row's hems clear the lower hooks. */
const MIN_ROW_GAP = 0.015;
const MAX_ROW_GAP = 0.06;

/** Above this, pieces hang on two rails instead of one. */
const SINGLE_ROW_MAX = 3;

export interface Slot {
  /** Centre of the bag, as a fraction of the frame width. */
  x: number;
  /** The rail it hangs from, as a fraction of the frame height. */
  y: number;
  row: number;
}

export interface Layout {
  /** Bag width, as a fraction of the frame width. */
  width: number;
  /** Bag height, as a fraction of the frame height. */
  height: number;
  /** One per garment, in order. */
  slots: Slot[];
  /** Rail heights, top first. Only the first is in the footage; the rest are drawn. */
  rowYs: number[];
}

/** A bag's height follows from its width, so the shape never changes with the count. */
export function bagHeight(width: number): number {
  return width * FRAME_ASPECT * BAG_RATIO;
}

/**
 * Where every piece hangs.
 *
 * The cavity is one wide volume, but hanging everything in a single row makes
 * each bag a sliver — eight across a rail that is 0.408 of the frame leaves
 * about 55px per piece at the page's width, and a photo inside that is
 * unreadable. Splitting into two rails roughly doubles the width of every bag
 * and quadruples its area, which is what makes the photos legible. The lower
 * rail isn't in the footage and gets drawn over it.
 */
export function layout(count: number): Layout {
  if (count <= 0) return { width: 0, height: 0, slots: [], rowYs: [] };

  const rows = count <= SINGLE_ROW_MAX ? 1 : 2;
  const perRow = Math.ceil(count / rows);

  // Slightly wider than an even share, so the pieces overlap by about 10% the
  // way clothes actually sit on a rail.
  let width = Math.min(MAX_BAG_W, (railWidth() * 1.1) / perRow);
  let height = bagHeight(width);

  // Two rows have to fit between the rail and the floor. If they don't, the
  // bags shrink rather than hanging through the bottom of the wardrobe.
  const available = railDrop();
  const tallest = (available - MIN_ROW_GAP * (rows - 1)) / rows;
  if (height > tallest) {
    height = tallest;
    width = height / (FRAME_ASPECT * BAG_RATIO);
  }

  const slack = available - height * rows;
  const gap =
    rows === 1
      ? 0
      : Math.min(Math.max(slack / rows, MIN_ROW_GAP), MAX_ROW_GAP);

  const rowYs = Array.from({ length: rows }, (_, row) => RAIL.y + row * (height + gap));

  const slots: Slot[] = [];
  for (let row = 0; row < rows; row += 1) {
    const start = row * perRow;
    const inThisRow = Math.min(perRow, count - start);
    if (inThisRow <= 0) break;
    for (const x of hangPositions(inThisRow, width)) {
      slots.push({ x, y: rowYs[row], row });
    }
  }

  return { width, height, slots, rowYs };
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
