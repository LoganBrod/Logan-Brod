"use client";

import { useEffect, useRef, useState } from "react";
import CalibrationSwipe from "./CalibrationSwipe";
import { sources } from "@/lib/copy";
import { MAX_BRANDS_CHARS, type Preferences } from "@/lib/preferences";

/**
 * The minute before the first clozet.
 *
 * Three questions the first run could never answer for itself, asked once, in
 * the order they are easiest to answer: fifteen pieces to swipe (no thinking),
 * a row of labels to tap (barely any), and what you usually spend (one tap).
 * Everything here already existed as a page or a form field; what did not
 * exist was a single moment that asked all of it before the run that decides
 * whether anyone comes back.
 *
 * Every step can be skipped and the whole thing can be closed, and closing
 * counts as done. A quiz that comes back because somebody dismissed it is a
 * nag, and a nag gets the feature turned off - by them, in their head, which
 * is the only place that matters.
 *
 * The answers land in the same preference record the form reads, so nothing
 * is stored twice and the form can still change any of it afterwards.
 */

type Step = "swipe" | "brands" | "budget";
const STEPS: Step[] = ["swipe", "brands", "budget"];

/**
 * What one piece usually costs. Four bands, chosen so the middle two cover
 * where secondhand menswear actually sits and the ends catch people who shop
 * outside it. Each maps to a min and max the form starts from.
 */
export const BUDGET_BANDS = [
  { label: "Under $60", hint: "Basics and the good cheap finds.", min: 15, max: 60 },
  { label: "$60 to $150", hint: "Where most of it lives.", min: 40, max: 150 },
  { label: "$150 to $300", hint: "The pieces that last.", min: 80, max: 300 },
  { label: "$300 and up", hint: "Investment, or a very good coat.", min: 150, max: 700 },
] as const;

/** How many labels can be tapped before the free text is the better tool. */
const MAX_LABELS = 6;

export default function OnboardingQuiz({
  initial,
  onSave,
  onClose,
}: {
  initial: Preferences;
  /** Writes a patch through to the server. Optimistic, like the form's own. */
  onSave: (patch: Partial<Preferences>) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("swipe");
  const [picked, setPicked] = useState<string[]>(() =>
    (initial.brands ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => (sources.labels as readonly string[]).includes(s))
  );
  const [extra, setExtra] = useState("");
  const [band, setBand] = useState<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Closing by any route marks the quiz seen. See the note at the top.
  function finish() {
    onSave({ onboarded: true });
    onClose();
  }

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the heading on each step so a screen reader announces the change.
  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  const next = () => {
    const at = STEPS.indexOf(step);
    if (at < STEPS.length - 1) setStep(STEPS[at + 1]);
    else finish();
  };

  function saveBrands() {
    const typed = extra
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const brands = [...picked, ...typed].join(", ").slice(0, MAX_BRANDS_CHARS);
    if (brands) onSave({ brands });
    next();
  }

  function saveBudget() {
    if (band !== null) {
      const { min, max } = BUDGET_BANDS[band];
      onSave({ budget: { min, max } });
    }
    next();
  }

  const toggle = (label: string) =>
    setPicked((current) =>
      current.includes(label)
        ? current.filter((l) => l !== label)
        : current.length >= MAX_LABELS
          ? current
          : [...current, label]
    );

  const at = STEPS.indexOf(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-room-ink/30 p-4 backdrop-blur-sm sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) finish();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-title"
        // The room's panel surface, not hard white - see ScanPrompt for why.
        className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-3xl border border-room-line bg-room-panel p-6 shadow-[0_24px_60px_rgba(6,6,8,0.45)] sm:p-8"
      >
        <div className="mb-5 flex items-center justify-between">
          {/* Three dots, not a progress bar: it is short enough to be counted. */}
          <ol className="flex gap-1.5" aria-label={`Step ${at + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-hidden
                className={`h-1.5 rounded-full transition-all ${
                  i === at ? "w-6 bg-room-ink" : i < at ? "w-1.5 bg-room-ink" : "w-1.5 bg-room-line"
                }`}
              />
            ))}
          </ol>
          <button
            type="button"
            onClick={finish}
            className="-mr-2 px-2 py-1 text-[12px] font-semibold text-room-faint hover:text-room-ink"
          >
            Skip all
          </button>
        </div>

        {step === "swipe" && (
          <>
            <h2
              id="quiz-title"
              ref={titleRef}
              tabIndex={-1}
              className="text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-room-ink outline-none"
            >
              Fifteen pieces. Yes or no.
            </h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-room-muted">
              About a minute. What you turn down teaches it as much as what you keep.
            </p>
            <CalibrationSwipe compact onDone={next} />
            <button
              type="button"
              onClick={next}
              className="mt-4 text-[12px] font-semibold text-room-faint hover:text-room-ink"
            >
              Skip this step
            </button>
          </>
        )}

        {step === "brands" && (
          <>
            <h2
              id="quiz-title"
              ref={titleRef}
              tabIndex={-1}
              className="text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-room-ink outline-none"
            >
              Any labels you already like?
            </h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-room-muted">
              Tap a few. It won&rsquo;t only look for these - it uses them to understand the register.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sources.labels.map((label) => {
                const on = picked.includes(label);
                const full = picked.length >= MAX_LABELS && !on;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    disabled={full}
                    onClick={() => toggle(label)}
                    className={`rounded-sm border px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      on
                        ? "border-room-ink bg-room-ink text-room-on-ink"
                        : "border-room-line bg-room-panel text-room-muted hover:border-room-ink/40 hover:text-room-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              maxLength={MAX_BRANDS_CHARS}
              placeholder="Others, separated by commas"
              className="field mt-4 w-full"
            />
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={saveBrands} className="btn-primary">
                Next
              </button>
              <button type="button" onClick={next} className="btn-ghost">
                Skip
              </button>
            </div>
          </>
        )}

        {step === "budget" && (
          <>
            <h2
              id="quiz-title"
              ref={titleRef}
              tabIndex={-1}
              className="text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-room-ink outline-none"
            >
              What do you usually spend on one piece?
            </h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-room-muted">
              A starting point for the price range, not a limit. You can change it on any search.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {BUDGET_BANDS.map((b, i) => {
                const on = band === i;
                return (
                  <button
                    key={b.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBand(i)}
                    className={`rounded-sm border px-4 py-3 text-left transition-colors ${
                      on
                        ? "border-room-ink bg-room-ink text-room-on-ink"
                        : "border-room-line bg-room-panel hover:border-room-ink/40"
                    }`}
                  >
                    <span className={`block text-[14px] font-semibold ${on ? "" : "text-room-ink"}`}>
                      {b.label}
                    </span>
                    <span className={`block text-[12px] ${on ? "opacity-80" : "text-room-muted"}`}>
                      {b.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={saveBudget} className="btn-primary">
                Done
              </button>
              <button type="button" onClick={next} className="btn-ghost">
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
