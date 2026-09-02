"use client";

import { useState } from "react";
import StyleQuestions from "./StyleQuestions";
import { ADVENTURES, FITS, OCCASIONS, hasPreferences, type Preferences } from "@/lib/preferences";

/**
 * The five questions, folded.
 *
 * They used to sit open on every visit: three rows of chips, a row of
 * colours, a text field - the "lengthy thing" between the photos and the
 * button. Once the first-visit quiz has asked them, showing them open again
 * is asking a second time. So they collapse to one line that says what the
 * app currently believes, and a single word to change it.
 *
 * Nothing is removed. The full questions are one tap away, and somebody who
 * skipped the quiz sees a nudge here instead of a blank.
 */
export default function PreferenceSummary({
  value,
  onChange,
  disabled,
  onRetake,
}: {
  value: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  disabled?: boolean;
  /** Reopens the swipe-and-tap quiz. */
  onRetake?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const answered = hasPreferences(value);

  const parts: string[] = [];
  const label = <T extends string>(opts: readonly { value: T; label: string }[], v?: T) =>
    opts.find((o) => o.value === v)?.label;
  const o = label(OCCASIONS, value.occasion);
  const f = label(FITS, value.fit);
  const a = label(ADVENTURES, value.adventure);
  if (o) parts.push(o);
  if (f) parts.push(`${f.toLowerCase()} fit`);
  if (a) parts.push(a.toLowerCase());
  if (value.avoid?.length) parts.push(`never ${value.avoid.join(", ")}`);
  if (value.brands) parts.push(value.brands);
  if (value.budget) parts.push(`$${value.budget.min}–${value.budget.max} a piece`);

  return (
    <div className="col-span-2 rounded-sm border border-room-line bg-room-sunk">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
        <p className="min-w-0 text-[13px] leading-relaxed text-room-muted">
          {answered ? (
            <>
              <span className="font-medium text-room-ink">About you:</span>{" "}
              {parts.join(" · ")}
            </>
          ) : (
            <>
              <span className="font-medium text-room-ink">Nothing about you yet.</span> A few taps
              and the first clozet stops guessing.
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-4">
          {onRetake && (
            <button
              type="button"
              onClick={onRetake}
              disabled={disabled}
              className="text-[12px] font-semibold text-room-muted hover:text-room-ink disabled:opacity-40"
            >
              Retake the quiz
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={disabled}
            aria-expanded={open}
            className="text-[12px] font-semibold text-accent hover:underline disabled:opacity-40"
          >
            {open ? "Done" : answered ? "Edit" : "Answer"}
          </button>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-4 border-t border-room-line px-5 py-5">
          <StyleQuestions value={value} onChange={onChange} disabled={disabled} />
        </div>
      )}
    </div>
  );
}
