import { CoinIcon } from '../icons'
import { formatCredits } from '../../lib/format'

interface BetPanelProps {
  bet: number
  chips: number[]
  disabled?: boolean
  onAddChip: (value: number) => void
  onHalve: () => void
  onDouble: () => void
  onMax: () => void
  onClear: () => void
}

export function BetPanel({ bet, chips, disabled, onAddChip, onHalve, onDouble, onMax, onClear }: BetPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Bet amount</span>
        <div className="flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface-2) px-3 py-1.5">
          <CoinIcon className="h-4 w-4 text-(--color-gold)" />
          <span className="font-display text-sm font-bold tabular-nums">{formatCredits(bet)}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={onHalve}
          disabled={disabled}
          className="rounded-lg border border-(--color-border) bg-(--color-surface-2) py-2 text-xs font-bold text-gray-300 transition-colors hover:border-(--color-primary)/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          1/2
        </button>
        <button
          onClick={onDouble}
          disabled={disabled}
          className="rounded-lg border border-(--color-border) bg-(--color-surface-2) py-2 text-xs font-bold text-gray-300 transition-colors hover:border-(--color-primary)/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          2x
        </button>
        <button
          onClick={onMax}
          disabled={disabled}
          className="rounded-lg border border-(--color-border) bg-(--color-surface-2) py-2 text-xs font-bold text-gray-300 transition-colors hover:border-(--color-primary)/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Max
        </button>
        <button
          onClick={onClear}
          disabled={disabled}
          className="rounded-lg border border-(--color-border) bg-(--color-surface-2) py-2 text-xs font-bold text-gray-300 transition-colors hover:border-(--color-primary)/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((value) => (
          <button
            key={value}
            onClick={() => onAddChip(value)}
            disabled={disabled}
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-(--color-gold)/60 bg-linear-to-br from-(--color-surface-2) to-(--color-surface-3) text-xs font-bold text-(--color-gold) shadow-md transition-transform hover:scale-110 hover:border-(--color-gold) disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            +{value}
          </button>
        ))}
      </div>
    </div>
  )
}
