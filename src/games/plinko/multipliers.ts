export type RiskLevel = 'low' | 'medium' | 'high'
export const ROW_OPTIONS = [8, 12, 16] as const
export type RowCount = (typeof ROW_OPTIONS)[number]

export const MULTIPLIER_TABLES: Record<RowCount, Record<RiskLevel, number[]>> = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    low: [8.1, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 8.1],
    medium: [24, 6, 3, 1.8, 1, 0.7, 0.4, 0.7, 1, 1.8, 3, 6, 24],
    high: [58, 15, 7, 2, 1, 0.5, 0.2, 0.5, 1, 2, 7, 15, 58],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
}
