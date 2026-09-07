"use client";

import { useEffect, useRef, useState } from "react";
import { elapsedLabel, reassurance } from "@/lib/progress";

/**
 * What a wait looks like, everywhere a wait happens.
 *
 * The closet run has RunProgress, and it earned it: a bar that moves, steps
 * that name the work, a timer that proves the page is alive. Everything else
 * that took time - the judge, the sizing lookup, accessories, colognes, the
 * calibration deck, the lists on the tools and saved tabs - said "Looking…"
 * on a button or said nothing at all, for up to two minutes. That is the same
 * failure the run had before RunProgress: a page that is working and a page
 * that has died look identical.
 *
 * Two pieces. `Waiting` is for a request in flight: a line naming the work,
 * an elapsed clock, an indeterminate bar, and after twenty-five seconds the
 * same reassurance the run gives. It does not fake progress - there is no
 * percentage, because nothing here can honestly report one. `Skeleton` is for
 * a page or list that has not arrived yet: the shape of the thing, so the
 * layout does not jump when it does.
 */
export default function Waiting({
  label,
  steps,
  className = "",
}: {
  /** What is being done, present tense, to the person: "Reading the listing". */
  label: string;
  /**
   * Named stages that take over the label as time passes. Honest about order,
   * silent about proportion: "after" is when the stage typically begins.
   */
  steps?: Array<{ label: string; afterMs: number }>;
  className?: string;
}) {
  const startedRef = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - startedRef.current;
  const current =
    steps?.reduce<string | null>((acc, step) => (elapsed >= step.afterMs ? step.label : acc), null) ??
    label;
  const note = reassurance(elapsed);

  return (
    <div role="status" aria-live="polite" className={`w-full max-w-xl ${className}`}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm tracking-wide text-room-ink">{current}</p>
        <p className="font-mono text-[12px] tabular-nums text-room-faint">{elapsedLabel(elapsed)}</p>
      </div>
      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-room-line">
        <div className="animate-sweep h-full w-1/3 rounded-full bg-room-ink motion-reduce:animate-none motion-reduce:w-1/2" />
      </div>
      {steps && steps.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {steps.map((step) => {
            const reached = elapsed >= step.afterMs;
            const active = reached && step.label === current;
            return (
              <li
                key={step.label}
                className={`text-[11px] tracking-[0.08em] ${
                  active ? "text-room-ink" : reached ? "text-room-muted" : "text-room-faint"
                }`}
              >
                <span aria-hidden className="mr-1.5">
                  {active ? "›" : reached ? "✓" : "·"}
                </span>
                {step.label}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 min-h-[1.25rem] text-[12px] leading-relaxed text-room-faint">{note}</p>
    </div>
  );
}

/** A block the shape of what is coming. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-sm bg-room-sunk ${className}`} />;
}

/** A few panel-shaped rows, for a list that has not arrived. */
export function SkeletonRows({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="panel flex items-center justify-between gap-6 px-6 py-5">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5 max-w-[14rem]" />
            <Skeleton className="h-3 w-3/5 max-w-[22rem]" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

/** The page opening, before the page: a title, a lede, the account corner. */
export function SkeletonHeader({ tabs = false }: { tabs?: boolean }) {
  return (
    <div aria-hidden>
      {tabs && (
        <div className="mb-10 flex items-end gap-7 border-b border-room-line">
          <Skeleton className="mb-3 h-4 w-12" />
          <Skeleton className="mb-3 h-4 w-12" />
          <Skeleton className="mb-3 h-4 w-12" />
        </div>
      )}
      <div className="mb-12 flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
        <div className="max-w-[34rem] space-y-5">
          <Skeleton className="h-10 w-72 sm:h-12 sm:w-96" />
          <Skeleton className="h-4 w-64 sm:w-80" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}
