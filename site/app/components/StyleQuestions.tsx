"use client";

import {
  ADVENTURES,
  AVOIDABLE_COLOURS,
  FITS,
  MAX_AVOID,
  MAX_BRANDS_CHARS,
  OCCASIONS,
  type Preferences,
} from "@/lib/preferences";

/**
 * The five things the photographs can't say.
 *
 * A run knew a price range and, sometimes, a set of measurements. Everything
 * else was inferred from three images: what somebody is dressing for, how close
 * to the body they want things, whether they want to be surprised, which
 * colours they'd never wear. Guessing at those is a good part of why the
 * results came back hit or miss.
 *
 * Every answer is optional and every one is a single tap. The moment this needs
 * scrolling or thinking it stops being answered, and a half-filled form is
 * worse than a short one — so the temptation to add a sixth question should be
 * resisted.
 */
export default function StyleQuestions({
  value,
  onChange,
  disabled,
}: {
  value: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  disabled?: boolean;
}) {
  const avoid = value.avoid ?? [];
  const atLimit = avoid.length >= MAX_AVOID;

  const toggleColour = (colour: string) => {
    const next = avoid.includes(colour)
      ? avoid.filter((c) => c !== colour)
      : atLimit
        ? avoid
        : [...avoid, colour];
    onChange({ avoid: next });
  };

  return (
    <div className="col-span-2 space-y-6">
      <Row label="What are you dressing for?">
        <Choices
          options={OCCASIONS}
          selected={value.occasion}
          onSelect={(occasion) => onChange({ occasion })}
          disabled={disabled}
        />
      </Row>

      <Row label="How do you like things to fit?">
        <Choices
          options={FITS}
          selected={value.fit}
          onSelect={(fit) => onChange({ fit })}
          disabled={disabled}
        />
      </Row>

      <Row label="How far should it push you?">
        <Choices
          options={ADVENTURES}
          selected={value.adventure}
          onSelect={(adventure) => onChange({ adventure })}
          disabled={disabled}
        />
      </Row>

      <Row
        label="Anything you'd never wear?"
        note={
          atLimit
            ? `${MAX_AVOID} is the limit — much more and there's nothing left to find.`
            : "Tap a colour to rule it out. These are rules, not hints."
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {AVOIDABLE_COLOURS.map((colour) => {
            const on = avoid.includes(colour);
            return (
              <button
                key={colour}
                type="button"
                aria-pressed={on}
                disabled={disabled || (atLimit && !on)}
                onClick={() => toggleColour(colour)}
                className={`rounded-sm border px-2.5 py-1.5 text-[12px] capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  on
                    ? "border-room-ink bg-room-ink text-white line-through"
                    : "border-room-line bg-room-panel text-room-muted hover:border-room-ink/40 hover:text-room-ink"
                }`}
              >
                {colour}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Any makers you already like?" note="Optional. It won't only look for these.">
        <input
          type="text"
          value={value.brands ?? ""}
          disabled={disabled}
          maxLength={MAX_BRANDS_CHARS}
          onChange={(e) => onChange({ brands: e.target.value })}
          placeholder="Carhartt, Uniqlo, Adidas…"
          className="field w-full"
        />
      </Row>
    </div>
  );
}

function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      {children}
      {note && <p className="mt-1.5 text-[11px] leading-relaxed text-room-faint">{note}</p>}
    </div>
  );
}

/**
 * One row of mutually exclusive answers.
 *
 * A second tap on the chosen one clears it. Every question here is optional,
 * and a set of radio buttons you can't un-answer quietly turns an optional
 * question into a required one the moment somebody taps it by accident.
 */
function Choices<T extends string>({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: readonly { value: T; label: string; hint: string }[];
  selected: T | undefined;
  onSelect: (value: T | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {options.map((option) => {
        const on = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            title={option.hint}
            onClick={() => onSelect(on ? undefined : option.value)}
            className={`rounded-sm border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              on
                ? "border-room-ink bg-room-ink text-white"
                : "border-room-line bg-room-panel hover:border-room-ink/40"
            }`}
          >
            <span className="block text-[13px] font-medium leading-tight">{option.label}</span>
            <span
              className={`mt-0.5 block text-[11px] leading-snug ${
                on ? "text-white/70" : "text-room-faint"
              }`}
            >
              {option.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
