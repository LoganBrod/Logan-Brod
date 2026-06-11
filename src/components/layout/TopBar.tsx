import { useState } from 'react'
import { useWallet } from '../../store/useWallet'
import { formatCredits } from '../../lib/format'
import { CoinIcon, MenuIcon, RefreshIcon } from '../icons'

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const balance = useWallet((s) => s.balance)
  const lastDelta = useWallet((s) => s.lastDelta)
  const resetBalance = useWallet((s) => s.resetBalance)
  const [pulse, setPulse] = useState(false)

  const handleReset = () => {
    resetBalance()
    setPulse(true)
    window.setTimeout(() => setPulse(false), 400)
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-bg)/80 px-4 py-3 backdrop-blur-md sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-gray-300 hover:bg-(--color-surface-2) lg:hidden"
        aria-label="Open menu"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <div className="hidden font-display text-sm font-bold text-gray-300 lg:block">
        Welcome back to the table.
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div
          key={lastDelta}
          className={`flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-surface-2) px-3 py-1.5 sm:px-4 sm:py-2 ${
            lastDelta !== 0 ? 'coin-pop' : ''
          }`}
        >
          <CoinIcon className="h-5 w-5 text-(--color-gold)" />
          <span className="font-display text-sm font-bold tabular-nums sm:text-base">
            {formatCredits(balance)}
          </span>
          {lastDelta !== 0 && (
            <span
              className={`text-xs font-bold tabular-nums ${
                lastDelta > 0 ? 'text-(--color-primary)' : 'text-(--color-loss)'
              }`}
            >
              {lastDelta > 0 ? '+' : ''}
              {formatCredits(lastDelta)}
            </span>
          )}
        </div>

        <button
          onClick={handleReset}
          className={`group flex items-center gap-1.5 rounded-full bg-linear-to-r from-(--color-primary) to-(--color-accent) px-3 py-1.5 text-xs font-bold text-black shadow-(--shadow-glow) transition-transform hover:scale-105 sm:px-4 sm:py-2 sm:text-sm ${
            pulse ? 'pulse-glow' : ''
          }`}
          title="Reset demo balance to 1,000 credits"
        >
          <RefreshIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Refill</span>
        </button>
      </div>
    </header>
  )
}
