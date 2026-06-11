export interface Layout {
  rows: number
  width: number
  height: number
  pegSpacing: number
  rowSpacing: number
  topPadding: number
  pegRadius: number
  ballRadius: number
  bucketHeight: number
}

export interface Point {
  x: number
  y: number
}

const BOARD_WIDTH = 640

export function computeLayout(rows: number): Layout {
  const pegSpacing = BOARD_WIDTH / (rows + 2)
  const rowSpacing = Math.max(24, Math.min(34, 480 / rows))
  const topPadding = 28
  const bucketHeight = 54
  const height = topPadding + rows * rowSpacing + bucketHeight + 20
  const pegRadius = Math.max(2.5, Math.min(5, pegSpacing * 0.09))
  const ballRadius = pegRadius * 1.9

  return {
    rows,
    width: BOARD_WIDTH,
    height,
    pegSpacing,
    rowSpacing,
    topPadding,
    pegRadius,
    ballRadius,
    bucketHeight,
  }
}

export function pegPosition(layout: Layout, row: number, col: number): Point {
  const centerX = layout.width / 2
  return {
    x: centerX + (col - row / 2) * layout.pegSpacing,
    y: layout.topPadding + row * layout.rowSpacing,
  }
}

export function bucketPosition(layout: Layout, col: number): Point {
  const centerX = layout.width / 2
  return {
    x: centerX + (col - layout.rows / 2) * layout.pegSpacing,
    y: layout.topPadding + layout.rows * layout.rowSpacing,
  }
}

/** Each step is 0 (bounce left) or 1 (bounce right). */
export function simulatePath(rows: number): number[] {
  const path: number[] = []
  for (let i = 0; i < rows; i++) {
    path.push(Math.random() < 0.5 ? 1 : 0)
  }
  return path
}

export function bucketFromPath(path: number[]): number {
  return path.reduce((sum, step) => sum + step, 0)
}

export function computeWaypoints(layout: Layout, path: number[]): Point[] {
  const points: Point[] = [{ x: layout.width / 2, y: 0 }]
  let col = 0
  for (let row = 0; row < layout.rows; row++) {
    points.push(pegPosition(layout, row, col))
    col += path[row]
  }
  points.push(bucketPosition(layout, col))
  return points
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

/** Maps a multiplier to a color on a blue -> gold -> red scale relative to the table's max. */
export function colorForMultiplier(mult: number, maxMult: number): string {
  const t = Math.min(1, Math.log(mult + 1) / Math.log(maxMult + 1))
  if (t < 0.18) return mixColor('#3a4566', '#4fd1c5', t / 0.18)
  if (t < 0.55) return mixColor('#4fd1c5', '#ffd166', (t - 0.18) / 0.37)
  return mixColor('#ffd166', '#ff3b6b', (t - 0.55) / 0.45)
}

export const SEGMENT_DURATION = 165
