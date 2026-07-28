"use client";

/**
 * The progress rail across the top of the new-listing flow.
 *
 * The flow used to present connecting eBay, teaching the Brain and uploading
 * photos all at once on different pages, leaving it unclear what had to happen
 * first. Showing the sequence — and which parts are already satisfied — is the
 * point of this component, so steps already done are marked rather than hidden.
 */
export interface RailStep {
  key: string;
  label: string;
  /** Already satisfied before the seller got here (eBay linked, Brain fed). */
  done?: boolean;
}

export default function StepRail({
  steps,
  current,
  onJump,
}: {
  steps: RailStep[];
  current: string;
  onJump?: (key: string) => void;
}) {
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <ol className="flex flex-wrap items-stretch gap-px border border-ink-border bg-ink-border">
      {steps.map((s, i) => {
        const isCurrent = s.key === current;
        // Anything before the current step, or already satisfied, is
        // navigable; steps ahead are not, because they depend on this one.
        const reachable = i <= currentIndex || s.done;
        return (
          <li key={s.key} className="min-w-[7.5rem] flex-1">
            <button
              type="button"
              disabled={!reachable || !onJump}
              onClick={() => onJump?.(s.key)}
              aria-current={isCurrent ? "step" : undefined}
              className={
                "flex h-full w-full items-center gap-2 px-3 py-2.5 text-left transition-colors " +
                (isCurrent
                  ? "bg-brand text-ink"
                  : reachable
                    ? "bg-ink-card text-fog/70 hover:bg-ink-deep"
                    : "bg-ink-card text-fog/30")
              }
            >
              <span
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-bold " +
                  (isCurrent
                    ? "bg-ink/15 text-ink"
                    : s.done
                      ? "bg-brand/15 text-brand"
                      : "bg-fog/10 text-fog/50")
                }
              >
                {s.done && !isCurrent ? "✓" : i + 1}
              </span>
              <span className="text-xs font-bold leading-tight">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
