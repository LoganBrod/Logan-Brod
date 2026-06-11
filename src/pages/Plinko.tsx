import { useRef, useState } from 'react'
import { BetPanel } from '../components/ui/BetPanel'
import { Button } from '../components/ui/Button'
import { CoinIcon } from '../components/icons'
import { formatCredits, formatMultiplier } from '../lib/format'
import { PlinkoBoard, type PlinkoBoardHandle } from '../games/plinko/PlinkoBoard'
import { PLINKO_BET_CHIPS, usePlinko } from '../games/plinko/usePlinko'
import type { RiskLevel } from '../games/plinko/multipliers'

const RISK_LEVELS: { value: RiskLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export function Plinko() {
  const boardRef = useRef<PlinkoBoardHandle>(null)
  const {
    bet,
    rows,
    risk,
    multipliers,
    balance,
    activeBalls,
    history,
    resultId,
    canEditRows,
    canDrop,
    rowOptions,
    setRows,
    setRisk,
    adjustBet,
    setMaxBet,
    halveBet,
    doubleBetAmount,
    clearBet,
    beginDrop,
    finishDrop,
  } = usePlinko()

  const [toast, setToast] = useState<{ id: number; net: number; multiplier: number } | null>(null)

  async function handleDrop() {
    const drop = beginDrop()
    if (!drop || !boardRef.current) return
    const { wager, multipliers: table } = drop
    const { bucket } = await boardRef.current.drop()
    finishDrop(bucket, wager, table)
    setToast({ id: resultId + 1, net: wager * table[bucket] - wager, multiplier: table[bucket] })
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Plinko</h1>
        <p className="text-sm text-gray-400">
          Drop the ball and watch it bounce through the pegs &mdash; payout is set by the slot it lands in.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Controls */}
        <div className="order-2 flex flex-col gap-5 rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 sm:p-6 lg:order-1">
          <BetPanel
            bet={bet}
            chips={PLINKO_BET_CHIPS}
            onAddChip={adjustBet}
            onHalve={halveBet}
            onDouble={doubleBetAmount}
            onMax={setMaxBet}
            onClear={clearBet}
          />

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Risk</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {RISK_LEVELS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setRisk(value)}
                  className={`rounded-lg border py-2 text-xs font-bold transition-colors ${
                    risk === value
                      ? 'border-(--color-primary)/60 bg-(--color-primary)/10 text-(--color-primary)'
                      : 'border-(--color-border) bg-(--color-surface-2) text-gray-300 hover:border-(--color-primary)/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Rows</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {rowOptions.map((value) => (
                <button
                  key={value}
                  onClick={() => setRows(value)}
                  disabled={!canEditRows}
                  className={`rounded-lg border py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    rows === value
                      ? 'border-(--color-primary)/60 bg-(--color-primary)/10 text-(--color-primary)'
                      : 'border-(--color-border) bg-(--color-surface-2) text-gray-300 hover:border-(--color-primary)/40'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            {!canEditRows && (
              <p className="mt-1.5 text-xs text-gray-500">Row count locks while a ball is in play.</p>
            )}
          </div>

          <Button onClick={handleDrop} disabled={!canDrop} className="w-full py-4 text-base">
            Drop ball
          </Button>

          {balance === 0 && (
            <p className="-mt-2 text-xs font-semibold text-(--color-loss)">
              Out of credits — tap Refill in the top bar to keep playing.
            </p>
          )}

          {history.length > 0 && (
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Recent drops</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {history.map((item) => (
                  <span
                    key={item.id}
                    className={`rounded-md px-2 py-1 text-xs font-bold tabular-nums ${
                      item.net > 0
                        ? 'bg-(--color-primary)/10 text-(--color-primary)'
                        : item.net < 0
                          ? 'bg-(--color-loss)/10 text-(--color-loss)'
                          : 'bg-(--color-surface-2) text-gray-300'
                    }`}
                  >
                    {formatMultiplier(item.multiplier)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Board */}
        <div className="relative order-1 flex flex-col gap-4 rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 sm:p-6 lg:order-2">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>
              {activeBalls > 0 ? `${activeBalls} ball${activeBalls > 1 ? 's' : ''} in play` : 'Ready to drop'}
            </span>
            <span className="flex items-center gap-1.5">
              <CoinIcon className="h-4 w-4 text-(--color-gold)" />
              <span className="tabular-nums">{formatCredits(balance)}</span>
            </span>
          </div>

          <div className="relative">
            <PlinkoBoard ref={boardRef} rows={rows} multipliers={multipliers} />

            {toast && (
              <div
                key={toast.id}
                className="float-up pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-xl border px-4 py-2 text-center backdrop-blur-md"
                style={{
                  borderColor:
                    toast.net > 0 ? 'rgba(60,242,129,0.5)' : toast.net < 0 ? 'rgba(255,92,108,0.5)' : 'rgba(255,255,255,0.2)',
                  background:
                    toast.net > 0 ? 'rgba(60,242,129,0.1)' : toast.net < 0 ? 'rgba(255,92,108,0.1)' : 'rgba(255,255,255,0.05)',
                }}
              >
                <p className="font-display text-lg font-extrabold tabular-nums">{formatMultiplier(toast.multiplier)}</p>
                <p
                  className={`text-xs font-bold tabular-nums ${
                    toast.net > 0 ? 'text-(--color-primary)' : toast.net < 0 ? 'text-(--color-loss)' : 'text-gray-300'
                  }`}
                >
                  {toast.net > 0 ? '+' : ''}
                  {formatCredits(toast.net)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
