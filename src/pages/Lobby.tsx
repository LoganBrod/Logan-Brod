import { Link } from 'react-router-dom'
import { GameCard } from '../components/ui/GameCard'
import {
  CardsIcon,
  PlinkoIcon,
  DiceIcon,
  RouletteIcon,
  CrashIcon,
  MinesIcon,
  TrophyIcon,
  CoinIcon,
} from '../components/icons'
import { useWallet } from '../store/useWallet'
import { formatCredits } from '../lib/format'

export function Lobby() {
  const balance = useWallet((s) => s.balance)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-(--color-border) bg-linear-to-br from-(--color-surface-2) via-(--color-surface) to-(--color-surface) p-8 sm:p-12">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-(--color-primary)/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-(--color-accent)/20 blur-3xl" />

        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-(--color-primary)/40 bg-(--color-primary)/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-(--color-primary)">
            <TrophyIcon className="h-4 w-4" />
            Free-play demo casino
          </span>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Welcome to <span className="bg-linear-to-r from-(--color-primary) to-(--color-accent) bg-clip-text text-transparent">LuckyStack</span>
          </h1>
          <p className="mt-4 text-base text-gray-400 sm:text-lg">
            Crisp Blackjack and a physics-driven Plinko drop, built for fun. Every
            chip is virtual &mdash; play risk-free with your starting stack of
            credits.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/blackjack"
              className="rounded-full bg-linear-to-r from-(--color-primary) to-(--color-accent) px-6 py-3 text-sm font-bold text-black shadow-(--shadow-glow) transition-transform hover:scale-105"
            >
              Play Blackjack
            </Link>
            <Link
              to="/plinko"
              className="rounded-full border border-(--color-border) bg-(--color-surface-2) px-6 py-3 text-sm font-bold text-white transition-colors hover:border-(--color-primary)/50"
            >
              Drop Plinko
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface)/60 px-4 py-3 text-sm">
            <CoinIcon className="h-5 w-5 text-(--color-gold)" />
            <span className="text-gray-400">Your balance:</span>
            <span className="font-display font-bold text-white tabular-nums">{formatCredits(balance)} credits</span>
          </div>
        </div>
      </section>

      {/* Game grid */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">Originals</h2>
          <span className="text-sm text-gray-500">{6} games</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <GameCard
            title="Blackjack"
            tag="Table"
            description="Beat the dealer to 21. Hit, stand, double down."
            icon={CardsIcon}
            gradient="from-emerald-400 to-teal-500"
            to="/blackjack"
          />
          <GameCard
            title="Plinko"
            tag="Drop"
            description="Drop the ball, dodge the pegs, chase the multiplier."
            icon={PlinkoIcon}
            gradient="from-fuchsia-500 to-purple-600"
            to="/plinko"
          />
          <GameCard
            title="Dice"
            tag="Originals"
            description="Roll under or over your target for instant payouts."
            icon={DiceIcon}
            gradient="from-amber-400 to-orange-500"
            comingSoon
          />
          <GameCard
            title="Roulette"
            tag="Table"
            description="Red, black, or green &mdash; place your bets."
            icon={RouletteIcon}
            gradient="from-rose-500 to-red-600"
            comingSoon
          />
          <GameCard
            title="Crash"
            tag="Originals"
            description="Cash out before the multiplier crashes."
            icon={CrashIcon}
            gradient="from-sky-400 to-blue-600"
            comingSoon
          />
          <GameCard
            title="Mines"
            tag="Originals"
            description="Reveal tiles, avoid the mines, multiply your bet."
            icon={MinesIcon}
            gradient="from-lime-400 to-emerald-600"
            comingSoon
          />
        </div>
      </section>
    </div>
  )
}
