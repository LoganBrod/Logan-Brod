import { BetPanel } from '../components/ui/BetPanel'
import { Button } from '../components/ui/Button'
import { CoinIcon } from '../components/icons'
import { formatCredits } from '../lib/format'
import { HandValueBadge } from '../games/blackjack/HandValueBadge'
import { isBlackjack } from '../games/blackjack/hand'
import { PlayingCard } from '../games/blackjack/PlayingCard'
import { BET_CHIPS, useBlackjack } from '../games/blackjack/useBlackjack'
import type { Outcome } from '../games/blackjack/types'

function CardSlots() {
  return (
    <>
      <div className="h-24 w-16 rounded-lg border-2 border-dashed border-(--color-border) sm:h-28 sm:w-20" />
      <div className="h-24 w-16 rounded-lg border-2 border-dashed border-(--color-border) sm:h-28 sm:w-20" />
    </>
  )
}

function outcomeDisplay(outcome: Outcome, wager: number) {
  switch (outcome) {
    case 'blackjack':
      return {
        title: 'Blackjack!',
        amount: `+${formatCredits(wager * 1.5)}`,
        tone: 'border-(--color-gold)/50 bg-(--color-gold)/10 text-(--color-gold)',
      }
    case 'win':
      return {
        title: 'You Win!',
        amount: `+${formatCredits(wager)}`,
        tone: 'border-(--color-primary)/50 bg-(--color-primary)/10 text-(--color-primary)',
      }
    case 'lose':
      return {
        title: 'You Lose',
        amount: `-${formatCredits(wager)}`,
        tone: 'border-(--color-loss)/50 bg-(--color-loss)/10 text-(--color-loss)',
      }
    case 'push':
      return {
        title: 'Push',
        amount: 'Bet returned',
        tone: 'border-(--color-border) bg-(--color-surface-2) text-gray-200',
      }
    default:
      return null
  }
}

export function Blackjack() {
  const {
    playerHand,
    dealerHand,
    bet,
    wager,
    balance,
    phase,
    outcome,
    message,
    revealDealer,
    playerValue,
    dealerVisibleValue,
    canDeal,
    canDouble,
    canEditBet,
    isPlayerTurn,
    isSettled,
    adjustBet,
    setMaxBet,
    halveBet,
    doubleBetAmount,
    clearBet,
    deal,
    hit,
    stand,
    double,
  } = useBlackjack()

  const result = outcome ? outcomeDisplay(outcome, wager) : null
  const dealerHidden = !revealDealer && dealerHand.length > 1
  const playerHasBlackjack = isBlackjack(playerHand)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Blackjack</h1>
        <p className="text-sm text-gray-400">
          Beat the dealer to 21 without busting. Blackjack pays 3:2 &middot; dealer stands on 17.
        </p>
      </div>

      {/* Table */}
      <div className="relative flex min-h-[420px] flex-col justify-between overflow-hidden rounded-3xl border border-(--color-border) bg-[radial-gradient(ellipse_at_top,_rgba(60,242,129,0.10),_transparent_60%)] p-6 sm:p-10">
        <div className="pointer-events-none absolute inset-2 rounded-3xl border border-(--color-primary)/10 [box-shadow:inset_0_0_60px_rgba(60,242,129,0.06)]" />

        {/* Dealer */}
        <div className="relative flex flex-col items-center gap-3">
          <HandValueBadge
            label="Dealer"
            value={dealerVisibleValue.value}
            soft={dealerVisibleValue.soft}
            hidden={dealerHidden}
            isBlackjack={revealDealer && isBlackjack(dealerHand)}
          />
          <div className="flex min-h-28 gap-2 sm:min-h-32">
            {dealerHand.length === 0 ? (
              <CardSlots />
            ) : (
              dealerHand.map((card, i) => (
                <PlayingCard key={card.id} card={card} faceDown={i === 1 && !revealDealer} />
              ))
            )}
          </div>
        </div>

        {/* Outcome banner */}
        {result && (
          <div className="absolute left-1/2 top-1/2 z-10 w-[90%] max-w-xs -translate-x-1/2 -translate-y-1/2 animate-result text-center sm:w-auto">
            <div className={`rounded-2xl border px-6 py-4 backdrop-blur-md ${result.tone}`}>
              <p className="font-display text-2xl font-extrabold sm:text-3xl">{result.title}</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">{result.amount}</p>
            </div>
          </div>
        )}

        {/* Player */}
        <div className="relative flex flex-col items-center gap-3">
          <div className="flex min-h-28 gap-2 sm:min-h-32">
            {playerHand.length === 0 ? (
              <CardSlots />
            ) : (
              playerHand.map((card) => <PlayingCard key={card.id} card={card} />)
            )}
          </div>
          <HandValueBadge
            label="You"
            value={playerValue.value}
            soft={playerValue.soft}
            isBlackjack={playerHasBlackjack}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            {canEditBet ? (
              <>
                <BetPanel
                  bet={bet}
                  chips={BET_CHIPS}
                  disabled={!canEditBet}
                  onAddChip={adjustBet}
                  onHalve={halveBet}
                  onDouble={doubleBetAmount}
                  onMax={setMaxBet}
                  onClear={clearBet}
                />
                {balance === 0 && (
                  <p className="mt-2 text-xs font-semibold text-(--color-loss)">
                    Out of credits — tap Refill in the top bar to keep playing.
                  </p>
                )}
                {isSettled && message && (
                  <p className="mt-2 text-xs text-gray-400">{message}</p>
                )}
              </>
            ) : (
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Current wager</span>
                <div className="mt-1 flex items-center gap-2">
                  <CoinIcon className="h-5 w-5 text-(--color-gold)" />
                  <span className="font-display text-xl font-bold tabular-nums">{formatCredits(wager)}</span>
                </div>
                <p className="mt-2 text-sm text-gray-400">{message}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            {canEditBet && (
              <Button onClick={deal} disabled={!canDeal} className="min-w-32 px-8 py-4 text-base">
                {isSettled ? 'Deal again' : 'Deal'}
              </Button>
            )}
            {isPlayerTurn && (
              <>
                <Button variant="secondary" onClick={hit} className="flex-1 sm:flex-none">
                  Hit
                </Button>
                <Button variant="secondary" onClick={double} disabled={!canDouble} className="flex-1 sm:flex-none">
                  Double
                </Button>
                <Button onClick={stand} className="flex-1 sm:flex-none">
                  Stand
                </Button>
              </>
            )}
            {phase === 'dealer-turn' && (
              <Button disabled className="min-w-32 px-8 py-4 text-base">
                Dealer playing&hellip;
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
