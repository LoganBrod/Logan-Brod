interface HandValueBadgeProps {
  label: string
  value: number
  soft?: boolean
  hidden?: boolean
  isBlackjack?: boolean
}

export function HandValueBadge({ label, value, soft, hidden, isBlackjack }: HandValueBadgeProps) {
  const bust = value > 21

  let valueText = `${value}`
  if (hidden) valueText = `${value} + ?`
  else if (isBlackjack) valueText = 'Blackjack!'
  else if (bust) valueText = `${value} – Bust`
  else if (soft) valueText = `${value} (soft)`

  const tone = bust
    ? 'border-(--color-loss)/50 bg-(--color-loss)/10 text-(--color-loss)'
    : isBlackjack
      ? 'border-(--color-gold)/50 bg-(--color-gold)/10 text-(--color-gold)'
      : 'border-(--color-border) bg-(--color-surface-2) text-gray-200'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${tone}`}
    >
      {label}
      <span className="font-display text-sm tabular-nums normal-case tracking-normal">{valueText}</span>
    </span>
  )
}
