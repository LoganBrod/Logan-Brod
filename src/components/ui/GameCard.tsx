import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import type { IconProps } from '../icons'

interface GameCardProps {
  title: string
  tag: string
  description: string
  icon: ComponentType<IconProps>
  gradient: string
  to?: string
  comingSoon?: boolean
}

export function GameCard({ title, tag, description, icon: Icon, gradient, to, comingSoon }: GameCardProps) {
  const content = (
    <div
      className={`group relative flex h-44 flex-col justify-between overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 transition-all duration-200 ${
        comingSoon ? 'opacity-60' : 'hover:-translate-y-1 hover:border-(--color-primary)/50 hover:shadow-(--shadow-glow)'
      }`}
    >
      <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-linear-to-br ${gradient} opacity-20 blur-2xl transition-opacity duration-200 group-hover:opacity-40`} />

      <div className="relative flex items-start justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br ${gradient} text-white shadow-lg`}>
          <Icon className="h-6 w-6" />
        </span>
        <span className="rounded-full bg-(--color-surface-3) px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-300">
          {tag}
        </span>
      </div>

      <div className="relative">
        <h3 className="font-display text-lg font-bold text-white">{title}</h3>
        <p className="mt-1 text-sm text-gray-400">{description}</p>
      </div>

      {comingSoon && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <span className="rounded-full border border-(--color-border) bg-(--color-surface)/90 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-gray-300">
            Coming soon
          </span>
        </div>
      )}
    </div>
  )

  if (comingSoon || !to) {
    return content
  }

  return <Link to={to}>{content}</Link>
}
