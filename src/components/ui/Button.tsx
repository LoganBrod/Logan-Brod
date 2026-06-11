import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const variants: Record<Variant, string> = {
  primary:
    'bg-linear-to-r from-(--color-primary) to-(--color-accent) text-black shadow-(--shadow-glow) hover:scale-[1.03]',
  secondary:
    'border border-(--color-border) bg-(--color-surface-2) text-white hover:border-(--color-primary)/50',
  danger:
    'border border-(--color-loss)/40 bg-(--color-loss)/10 text-(--color-loss) hover:bg-(--color-loss)/20',
  ghost: 'text-gray-300 hover:bg-(--color-surface-2)',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-xl px-5 py-3 text-sm font-bold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
