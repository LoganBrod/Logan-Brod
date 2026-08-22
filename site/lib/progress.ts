// How far along a run is, as a number between 0 and 100.
//
// A closet takes the better part of a minute and most of it is spent waiting on
// somebody else's server. The old wait was a pulsing dot and a line of text,
// which is indistinguishable from a page that has crashed — and two of the four
// stages had no sub-progress of any kind, so the dot pulsed over unchanging
// words for twenty seconds at a stretch.
//
// The temptation is a bar driven by a timer, which is a lie: it either finishes
// before the work does and sits at 100% for ten seconds, or it reaches 99% and
// stops, which is worse than no bar at all. What follows tries to be honest
// instead.
//
// Two rules it will not break:
//
//   1. **It never goes backwards.** Enforced by the caller holding the maximum.
//   2. **A stage never fills its own span.** Within a stage the bar approaches
//      that stage's ceiling and never arrives; only the stage actually
//      finishing moves it past. So the bar is always moving, and it is never
//      claiming a step is done when it isn't.

export type RunStage = "preparing" | "analyzing" | "shopping" | "curating" | "saving";

export interface Span {
  /** Where this stage starts on the bar. */
  from: number;
  /** Where the next stage starts. This stage approaches it without reaching it. */
  to: number;
  /**
   * Roughly how long this stage takes, in milliseconds.
   *
   * This is the shape of the creep, not a deadline: at `tau` the bar has
   * covered about 63% of the span, at twice `tau` about 86%. A stage that runs
   * long therefore slows down rather than stopping, which is what it should
   * look like.
   *
   * These are estimates, and they are the one thing here that should be
   * re-tuned against real timings rather than argued about.
   */
  tau: number;
}

/**
 * The bar, divided up.
 *
 * Curation gets the largest span because it is the longest stage by a wide
 * margin — six model calls, each of which fetches sixteen photographs before it
 * can begin. Preparing gets almost nothing because it is browser-side image
 * resizing and is usually over before anyone reads the label.
 */
export const SPANS: Record<RunStage, Span> = {
  preparing: { from: 0, to: 6, tau: 800 },
  analyzing: { from: 6, to: 34, tau: 14000 },
  shopping: { from: 34, to: 50, tau: 5000 },
  curating: { from: 50, to: 96, tau: 22000 },
  saving: { from: 96, to: 100, tau: 1200 },
};

/**
 * The most of its own span a stage may cover on the clock alone.
 *
 * Not decoration. `1 - exp(-t/tau)` approaches 1 but never arrives *in real
 * numbers*; in floating point it saturates, and once the difference from 1 is
 * smaller than the span's own precision, `from + width * fraction` rounds up to
 * exactly `to`. A short stage left running — preparing, at tau 800ms, on a slow
 * phone — hits that within thirty seconds and the bar sits precisely on the
 * next stage's boundary, claiming a step is done while it is still running.
 */
const CEILING = 0.995;

/** Approaches `CEILING` without reaching it; about 0.63 at `tau`, 0.86 at `2 tau`. */
function eased(elapsedMs: number, tau: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return (1 - Math.exp(-elapsedMs / tau)) * CEILING;
}

/**
 * Where the bar should sit.
 *
 * `sub` is a real count of finished work, and when it is present it wins over
 * the clock — curation is the one stage that can actually say "three of six",
 * and a genuine signal should never be overridden by a guess. It is combined
 * with the clock rather than replacing it, though, because the first batch can
 * take twenty seconds to land and a bar frozen at 50% for that whole time is
 * the exact problem this exists to solve.
 */
export function runProgress(
  stage: RunStage,
  elapsedMs: number,
  sub?: { done: number; total: number } | null
): number {
  const span = SPANS[stage];
  const width = span.to - span.from;

  const byClock = span.from + width * eased(elapsedMs, span.tau);

  if (sub && sub.total > 0) {
    const ratio = Math.min(Math.max(sub.done / sub.total, 0), 1);
    // Held just short of the ceiling even when every batch is in: the stage is
    // not finished until the code says so, and the bar should not claim it is.
    const byWork = span.from + width * ratio * 0.98;
    return Math.min(Math.max(byClock, byWork), span.to);
  }

  return Math.min(byClock, span.to);
}

/**
 * A line under the bar, for a wait that has gone on longer than it should.
 *
 * Nothing here is an apology or an excuse — the point is only to say that the
 * silence is expected, because the thing a person actually wants to know at
 * forty seconds is whether the page is broken.
 */
export function reassurance(elapsedMs: number): string | null {
  if (elapsedMs < 25000) return null;
  if (elapsedMs < 60000) return "Still going — the searches take a moment.";
  if (elapsedMs < 120000) return "Taking longer than usual. Nothing's broken; hold on.";
  return "This is unusually slow. If nothing happens in another minute, try again.";
}

/** `1:04`, for a timer that proves the page is alive. */
export function elapsedLabel(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
