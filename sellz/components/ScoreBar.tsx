/**
 * Solid horizontal meter for a 0-100 Brain score.
 *
 * Replaces the old conic-gradient ring: a bar is easier to compare down a
 * column of listings than a set of circles, and it reads at small sizes.
 */
export default function ScoreBar({
  score,
  reason,
  label = "Score",
  compact = false,
}: {
  score: number;
  reason?: string;
  label?: string;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, score));
  const tone =
    pct >= 70 ? "bg-brand" : pct >= 40 ? "bg-fog/45" : "bg-red-400";

  if (compact) {
    return (
      <span title={reason} className="flex shrink-0 items-center gap-2">
        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-border">
          <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
        </span>
        <span className="w-6 text-right text-xs font-bold tabular-nums text-fog/70">{pct}</span>
      </span>
    );
  }

  return (
    <div title={reason} className="w-full">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-fog/55">
          {label}
        </span>
        <span className="text-sm font-extrabold tabular-nums text-fog">{pct}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink-border">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
