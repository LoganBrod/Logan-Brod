export function formatCredits(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatMultiplier(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)}x`
}
