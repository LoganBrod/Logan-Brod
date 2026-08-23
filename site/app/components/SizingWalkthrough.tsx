"use client";

import { useState } from "react";

/**
 * What the sizing page is for, and how to answer it.
 *
 * The page asks for five numbers and explains none of them. Two separate
 * problems hide in that: people do not know what the app *does* with a chest
 * measurement, and people do not know how to take one. The first makes them
 * skip the form; the second makes them guess, which is worse, because a wrong
 * inseam silently filters good trousers out of every future search.
 *
 * So: three cards for what happens, and a disclosure with the actual method for
 * each measurement. The method is the part worth getting right — every guide
 * says "measure your chest" and almost none of them say measure a jacket you
 * already own instead, which is easier, more accurate, and needs no help.
 */

const STEPS = [
  {
    title: "Give it your measurements",
    body: "Five numbers, once. Every search, every judgement and every standing scan uses them - a listing in a size you can't wear is dropped before anyone spends time on it.",
  },
  {
    title: "Name a brand you're unsure about",
    body: "A 42 from one maker is not a 42 from another. It reads that brand's own size guide and what buyers report, then tells you which size to buy.",
  },
  {
    title: "It remembers what it told you",
    body: "Checked brands are kept, so the answer is there next time. When a standing scan later turns up that brand, the sizing note comes with it.",
  },
] as const;

/**
 * How to take each measurement.
 *
 * Written around garments rather than bodies wherever that works. Measuring a
 * pair of trousers that already fit is more repeatable than measuring a leg,
 * and it is the only one of these you can do alone without a mirror.
 */
const MEASURES = [
  {
    field: "Tops",
    how: "The letter you already buy. If you are between two, take the smaller - secondhand knitwear has usually been washed at least once.",
    art: "torso",
  },
  {
    field: "Jacket chest",
    how: "Easiest from a jacket that fits: lay it flat, buttoned, and measure straight across from armpit to armpit. Double it. That is your chest in inches - 21 across is a 42.",
    also: "The letter after it is length, not width: S under about 5′8″, R to 6′0″, L above.",
    art: "chest",
  },
  {
    field: "Waist",
    how: "From trousers you wear, not your body. Lay them flat, do the button up, measure across the top of the waistband and double it.",
    also: "This is usually one to two inches larger than a tape around your middle, which is why trousers bought off a body measurement come back.",
    art: "waist",
  },
  {
    field: "Inseam",
    how: "Same trousers, laid flat: from the crotch seam straight down the inside of the leg to the hem.",
    also: "Measure the ones you like the length of. Inseam is a preference as much as a fact.",
    art: "inseam",
  },
  {
    field: "Shoe (US)",
    how: "Your usual US size. If you are between brands, use the one you buy most - the brand lookup below handles the rest.",
    art: "shoe",
  },
] as const;

function Art({ kind }: { kind: string }) {
  const stroke = "stroke-room-line";
  const mark = "stroke-accent";
  return (
    <svg viewBox="0 0 40 44" aria-hidden className="h-11 w-10 shrink-0" fill="none" strokeWidth="1.3">
      {kind === "torso" && (
        <path d="M13 6 L8 9 L6 18 L10 19 L11 38 H29 L30 19 L34 18 L32 9 L27 6 Z" className={stroke} />
      )}
      {kind === "chest" && (
        <>
          <path d="M13 6 L8 9 L6 18 L10 19 L11 38 H29 L30 19 L34 18 L32 9 L27 6 Z" className={stroke} />
          <path d="M7 17 H33" className={mark} strokeDasharray="2 2" />
        </>
      )}
      {kind === "waist" && (
        <>
          <path d="M11 6 H29 L28 40 H22 L20 20 L18 40 H12 Z" className={stroke} />
          <path d="M10.6 9 H29.4" className={mark} strokeDasharray="2 2" />
        </>
      )}
      {kind === "inseam" && (
        <>
          <path d="M11 6 H29 L28 40 H22 L20 20 L18 40 H12 Z" className={stroke} />
          <path d="M20 20 V39" className={mark} strokeDasharray="2 2" />
        </>
      )}
      {kind === "shoe" && (
        <path d="M9 30 C9 22 12 20 15 20 C19 20 20 24 24 26 C28 28 32 27 32 31 L32 34 H9 Z" className={stroke} />
      )}
    </svg>
  );
}

export default function SizingWalkthrough({ filledCount }: { filledCount: number }) {
  const [showing, setShowing] = useState(false);

  return (
    <div className="space-y-3">
      <ol className="grid gap-px overflow-hidden rounded-sm border border-room-line bg-room-line sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2 bg-room-panel px-5 py-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] tabular-nums text-room-faint">{index + 1}</span>
              <h3 className="text-sm font-semibold tracking-[-0.01em] text-room-ink">{step.title}</h3>
              {index === 0 && filledCount > 0 && (
                <span className="ml-auto text-[11px] font-medium text-accent">
                  {filledCount} of 5
                </span>
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-room-muted">{step.body}</p>
          </li>
        ))}
      </ol>

      {/* A disclosure rather than five permanent paragraphs: anyone who knows
          their sizes should not have to scroll past instructions to type them. */}
      <div className="rounded-sm border border-room-line bg-room-panel">
        <button
          type="button"
          onClick={() => setShowing((v) => !v)}
          aria-expanded={showing}
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
        >
          <span className="text-sm font-medium text-room-ink">
            Not sure how to measure these?
          </span>
          <span aria-hidden className="text-xs text-room-faint">
            {showing ? "Hide" : "Show"}
          </span>
        </button>

        {showing && (
          <dl className="space-y-4 border-t border-room-line px-5 py-4">
            {MEASURES.map((m) => (
              <div key={m.field} className="flex gap-4">
                <Art kind={m.art} />
                <div className="min-w-0">
                  <dt className="text-[13px] font-semibold text-room-ink">{m.field}</dt>
                  <dd className="mt-0.5 text-[13px] leading-relaxed text-room-muted">
                    {m.how}
                    {"also" in m && m.also && (
                      <span className="mt-1 block text-room-faint">{m.also}</span>
                    )}
                  </dd>
                </div>
              </div>
            ))}
            <p className="border-t border-room-line pt-3 text-[12px] leading-relaxed text-room-faint">
              Anything left blank simply isn&rsquo;t used. Four good numbers beat five guesses:
              a wrong inseam quietly drops trousers that would have fitted.
            </p>
          </dl>
        )}
      </div>
    </div>
  );
}
