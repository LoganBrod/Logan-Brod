"use client";

import { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-roobet-card border border-roobet-border rounded-2xl p-5 ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && (
              <h2 className="text-white font-bold text-base">{title}</h2>
            )}
            {subtitle && (
              <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-gray-400 text-xs uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full bg-roobet-dark border border-roobet-border rounded-lg px-3 py-2 text-sm text-white " +
  "placeholder-gray-600 focus:outline-none focus:border-roobet-gold/60";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ""}`}>
      {props.children}
    </select>
  );
}

/** Numeric input that keeps "" while typing and reports a parsed number. */
export function MoneyInput({
  value,
  onChange,
  placeholder = "0.00",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

export function parseMoney(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  className = "",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  const styles = {
    primary:
      "bg-roobet-gold text-roobet-dark font-semibold hover:brightness-110",
    ghost:
      "bg-transparent border border-roobet-border text-gray-300 hover:border-gray-500 hover:text-white",
    danger:
      "bg-transparent border border-red-800 text-red-400 hover:bg-red-900/30",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="text-gray-500 text-sm text-center py-6">{children}</p>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  hero = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
  hero?: boolean;
}) {
  const valueColor =
    tone === "good"
      ? "text-[#0ca30c]"
      : tone === "bad"
        ? "text-[#e66767]"
        : "text-white";
  return (
    <div className="bg-roobet-card border border-roobet-border rounded-2xl p-4">
      <p className="text-gray-500 text-xs uppercase tracking-widest">{label}</p>
      <p
        className={`font-bold mt-1 ${valueColor} ${hero ? "text-3xl md:text-4xl" : "text-xl"}`}
      >
        {value}
      </p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

/** Progress meter — fill + lighter track of the same hue so state reads across the bar. */
export function Meter({
  value,
  max,
  color = "#3987e5",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="h-2.5 rounded-full overflow-hidden"
      style={{ backgroundColor: `${color}26` }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
