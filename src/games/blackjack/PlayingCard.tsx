import type { Card } from './types'

interface PlayingCardProps {
  card?: Card
  faceDown?: boolean
  className?: string
  style?: React.CSSProperties
}

export function PlayingCard({ card, faceDown, className = '', style }: PlayingCardProps) {
  const base =
    'relative h-24 w-16 sm:h-28 sm:w-20 rounded-lg shadow-xl shrink-0 select-none animate-deal'

  if (faceDown || !card) {
    return (
      <div
        className={`${base} border-2 border-(--color-surface-3) bg-linear-to-br from-(--color-accent) to-(--color-primary)/50 ${className}`}
        style={style}
      >
        <div className="absolute inset-1.5 rounded-md border border-white/20 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.10)_0px,rgba(255,255,255,0.10)_4px,transparent_4px,transparent_8px)]" />
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-white/30">
          ★
        </div>
      </div>
    )
  }

  const isRed = card.suit === '♥' || card.suit === '♦'

  return (
    <div
      className={`${base} flex flex-col justify-between border border-gray-300 bg-white p-1.5 ${
        isRed ? 'text-red-600' : 'text-gray-900'
      } ${className}`}
      style={style}
    >
      <div className="text-left text-sm font-bold leading-none sm:text-base">
        <div>{card.rank}</div>
        <div>{card.suit}</div>
      </div>
      <div className="self-center text-2xl sm:text-3xl">{card.suit}</div>
      <div className="self-end rotate-180 text-right text-sm font-bold leading-none sm:text-base">
        <div>{card.rank}</div>
        <div>{card.suit}</div>
      </div>
    </div>
  )
}
