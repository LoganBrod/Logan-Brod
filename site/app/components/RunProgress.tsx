"use client";

import { useEffect, useRef, useState } from "react";
import { elapsedLabel, reassurance, runProgress, type RunStage } from "@/lib/progress";

const STAGE_COPY: Record<RunStage, string> = {
  preparing: "Preparing your photos",
  analyzing: "Reading your style",
  shopping: "Searching the marketplaces",
  curating: "Picking the ones that fit",
  saving: "Saving your clozet",
};

/** Four steps on screen; saving is a tail on curating rather than its own dot. */
const STEPS: { stage: RunStage; label: string }[] = [
  { stage: "preparing", label: "Photos" },
  { stage: "analyzing", label: "Style" },
  { stage: "shopping", label: "Search" },
  { stage: "curating", label: "Fit" },
];

const ORDER: RunStage[] = ["preparing", "analyzing", "shopping", "curating", "saving"];

/**
 * What a run looks like while you wait for it.
 *
 * This used to be a pulsing dot and one line of text, held for the better part
 * of a minute, with two of the four stages unable to say anything at all about
 * how far along they were. That is visually identical to a page that has died,
 * and people reasonably concluded the site was broken.
 *
 * Three things are on screen and each answers a different question. The bar
 * answers "is it moving". The steps answer "what is it doing" — which matters
 * because the honest answer is interesting: it is reading your photographs, and
 * then searching, and then judging what it found. And the timer answers "is
 * this thing alive", which is the one a stalled page can never fake.
 */
export default function RunProgress({
  stage,
  sub,
  compact = false,
}: {
  stage: RunStage;
  /** Finished batches, when the stage has a real count. */
  sub?: { done: number; total: number } | null;
  /**
   * The closet is already on screen and filling.
   *
   * The rail reveals as soon as the first batch lands, while five are still
   * running — so without this the bar simply disappeared at around 60% and
   * never finished, which is its own small dishonesty. Compact keeps the bar
   * and the count and drops the scaffolding, because by this point the pieces
   * arriving are the real answer to "is it working".
   */
  compact?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef<number>(Date.now());
  const stageStartedRef = useRef<number>(Date.now());
  // The bar is monotonic. Stage spans are ordered so it should never need to be
  // held, but a re-mount or a clock adjustment would otherwise show a jump
  // backwards, and a bar that retreats destroys the little trust it has.
  const peakRef = useRef(0);

  const [now, setNow] = useState(() => Date.now());

  /*
   * The stage clock is reset *during* render, not in an effect.
   *
   * An effect runs after the render that triggered it, so on a stage's very
   * first frame `stageStartedRef` still held the previous stage's start — the
   * new stage was handed twenty seconds of elapsed time it hadn't spent, jumped
   * almost to its own ceiling immediately, and the monotonic guard below then
   * froze it there for the stage's whole duration. Which is precisely the
   * motionless bar this component exists to replace, reintroduced.
   *
   * Assigning a ref during render is safe here because it's derived state, not
   * a subscription: same input, same result, no external effect.
   */
  const seenStageRef = useRef<RunStage>(stage);
  if (seenStageRef.current !== stage) {
    seenStageRef.current = stage;
    stageStartedRef.current = Date.now();
  }

  useEffect(() => {
    // Four times a second: fast enough that the bar moves smoothly, slow enough
    // that it isn't doing real work while six model calls are in flight.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  /*
   * Bring itself into view, once, when a run starts.
   *
   * On a phone the form is tall and the button sits near its bottom, so after
   * pressing it the viewport is still parked where the button was — which is
   * now somewhere in the middle of the page, well past the wardrobe and the
   * progress above it. The run was reporting itself perfectly to a part of the
   * screen nobody was looking at.
   *
   * On mount only: this fires once per run, immediately after a deliberate tap,
   * which is the one moment moving someone's scroll is what they wanted. Never
   * again afterwards, so it can't fight a person reading further down.
   */
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  }, []);

  const sinceStage = now - stageStartedRef.current;
  const sinceStart = now - startedRef.current;

  const raw = runProgress(stage, sinceStage, sub);
  peakRef.current = Math.max(peakRef.current, raw);
  const percent = peakRef.current;

  const index = ORDER.indexOf(stage);
  const note = reassurance(sinceStart);
  const counted = sub && sub.total > 1 ? ` · ${sub.done} of ${sub.total}` : "";

  return (
    /*
      Left-aligned to the same edge as the page's heading and the wardrobe
      below, rather than centred in its own column — centred, it read as a
      widget dropped onto the page instead of part of it. Capped in width
      because four step labels spread across a desktop-width row lose any sense
      of being a sequence.
    */
    <div ref={rootRef} className="w-full max-w-xl scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm tracking-wide text-room-ink">
          {STAGE_COPY[stage]}
          <span className="text-room-muted">{counted}</span>
        </p>
        {/* Tabular figures so the timer doesn't jitter the layout each second. */}
        <p className="font-mono text-[12px] tabular-nums text-room-faint">
          {Math.round(percent)}% · {elapsedLabel(sinceStart)}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Building your clozet"
        className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-room-line"
      >
        {/*
          Transitioned rather than animated frame by frame: the ticker moves
          this in 250ms steps, and a matching transition turns those steps into
          a continuous crawl. Slightly longer than the tick so it never catches
          up and stutters.
        */}
        <div
          className="h-full rounded-full bg-room-ink transition-[width] duration-300 ease-linear motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>

      {compact ? null : (
      <ol className="mt-3 flex justify-between gap-2">
        {STEPS.map((step) => {
          const at = ORDER.indexOf(step.stage);
          const done = index > at;
          const active = index === at || (step.stage === "curating" && stage === "saving");
          return (
            <li
              key={step.stage}
              className={`text-[11px] tracking-[0.08em] ${
                active ? "text-room-ink" : done ? "text-room-muted" : "text-room-faint"
              }`}
            >
              <span aria-hidden className="mr-1.5">
                {done ? "✓" : active ? "›" : "·"}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
      )}

      {/* Polite, not assertive: this is background reassurance, and it must not
          interrupt whatever a screen reader is in the middle of saying. */}
      {compact ? null : (
        <p
          aria-live="polite"
          className="mt-3 min-h-[1.25rem] text-[12px] leading-relaxed text-room-faint"
        >
          {note}
        </p>
      )}
    </div>
  );
}
