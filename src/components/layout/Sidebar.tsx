import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  CardsIcon,
  PlinkoIcon,
  DiceIcon,
  RouletteIcon,
  CrashIcon,
  MinesIcon,
  CloseIcon,
} from '../icons'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const games = [
  { to: '/', label: 'Lobby', icon: HomeIcon, end: true },
  { to: '/blackjack', label: 'Blackjack', icon: CardsIcon },
  { to: '/plinko', label: 'Plinko', icon: PlinkoIcon },
]

const comingSoon = [
  { label: 'Dice', icon: DiceIcon },
  { label: 'Roulette', icon: RouletteIcon },
  { label: 'Crash', icon: CrashIcon },
  { label: 'Mines', icon: MinesIcon },
]

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform border-r border-(--color-border) bg-(--color-surface) transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <a href="/" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-(--color-primary) to-(--color-accent) text-base text-black shadow-(--shadow-glow)">
              ♣
            </span>
            <span>
              Lucky<span className="text-(--color-primary)">Stack</span>
            </span>
          </a>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-(--color-surface-2) hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Play
          </p>
          {games.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-linear-to-r from-(--color-primary)/20 to-(--color-accent)/10 text-(--color-primary) shadow-[inset_0_0_0_1px_rgba(60,242,129,0.25)]'
                    : 'text-gray-300 hover:bg-(--color-surface-2) hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}

          <p className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Coming soon
          </p>
          {comingSoon.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex cursor-not-allowed items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-500"
            >
              <span className="flex items-center gap-3">
                <Icon className="h-5 w-5" />
                {label}
              </span>
              <span className="rounded-full bg-(--color-surface-3) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Soon
              </span>
            </div>
          ))}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-(--color-border) p-4">
          <div className="rounded-xl bg-(--color-surface-2) p-3 text-xs leading-relaxed text-gray-400">
            <p className="mb-1 font-semibold text-gray-200">Play money only</p>
            All balances are virtual demo credits for entertainment. No real
            money is ever wagered or paid out.
          </div>
        </div>
      </aside>
    </>
  )
}
