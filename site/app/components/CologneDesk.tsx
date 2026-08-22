"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BUDGETS,
  OCCASION_SLOTS,
  buyLinks,
  type CologneBudget,
  type CologneSlot,
} from "@/lib/cologneOptions";
// Type-only, so this import is erased and the SDK never reaches the bundle.
import type { CologneAdvice } from "@/lib/colognes";

const UBIQUITY: Record<string, { label: string; tone: string }> = {
  everywhere: { label: "You'll smell this on other people", tone: "text-room-faint" },
  known: { label: "Well known", tone: "text-room-faint" },
  uncommon: { label: "Not common", tone: "text-accent" },
};

/**
 * Fragrance, recommended rather than sold.
 *
 * The one page here that doesn't search a marketplace. Fragrance is among the
 * most counterfeited things online, a fake looks identical in a photograph, and
 * the people using this have no particular reason to know that — so this
 * recommends from knowledge and sends them to sellers who can be held to it.
 * No prices: there's no way to know today's, and a stale price is worse than
 * none.
 */
export default function CologneDesk() {
  const [slot, setSlot] = useState<CologneSlot>("everyday");
  const [budget, setBudget] = useState<CologneBudget>("50-120");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<CologneAdvice | null>(null);
  const [basedOnStyle, setBasedOnStyle] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/colognes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, budget }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "That didn't work.");
      setAdvice(json.advice as CologneAdvice);
      setBasedOnStyle(Boolean(json.basedOnStyle));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="panel px-6 py-6">
        <p className="label mb-2">What's it for?</p>
        <Choices options={OCCASION_SLOTS} selected={slot} onSelect={setSlot} disabled={busy} />

        <p className="label mb-2 mt-6">What are you spending?</p>
        <Choices options={BUDGETS} selected={budget} onSelect={setBudget} disabled={busy} />

        <button type="button" onClick={run} disabled={busy} className="btn-primary mt-6 w-full sm:w-auto">
          {busy ? "Thinking…" : advice ? "Ask again" : "Recommend something"}
        </button>

        {error && (
          <p className="mt-5 rounded-sm border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </section>

      {advice && (
        <section aria-label="Recommendations" className="space-y-8">
          <p className="max-w-[58ch] text-sm leading-relaxed text-room-muted">{advice.intro}</p>

          {!basedOnStyle && (
            <p className="max-w-[58ch] rounded-sm border border-room-line bg-room-sunk px-4 py-3 text-[12px] leading-relaxed text-room-muted">
              This is on the occasion and budget alone — no clozet to read your style from yet.{" "}
              <Link href="/closet" className="underline">
                Build one
              </Link>{" "}
              and these get a lot more specific.
            </p>
          )}

          <ol className="space-y-px overflow-hidden rounded-sm border border-room-line bg-room-line">
            {advice.picks.map((pick) => {
              const note = UBIQUITY[pick.ubiquity];
              return (
                <li key={`${pick.house}-${pick.name}`} className="bg-room-panel px-6 py-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-lg font-semibold tracking-[-0.015em] text-room-ink">
                      {pick.house} <span className="font-normal">{pick.name}</span>
                    </h3>
                    <p className="text-[11px] uppercase tracking-[0.1em] text-room-faint">
                      {pick.season}
                    </p>
                  </div>

                  <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-room-ink">
                    {pick.smells}
                  </p>
                  <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-room-muted">
                    {pick.wears}
                  </p>
                  <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-room-muted">
                    {pick.whyYou}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {note && <span className={`text-[11px] ${note.tone}`}>{note.label}</span>}
                    <span className="ml-auto flex flex-wrap gap-x-3 gap-y-1">
                      {buyLinks(pick).map((link) => (
                        <a
                          key={link.label}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] text-room-muted underline-offset-4 hover:text-room-ink hover:underline"
                        >
                          {link.label} &rarr;
                        </a>
                      ))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="max-w-[58ch] border-t border-room-line pt-5">
            <p className="eyebrow mb-2">Before you buy</p>
            <p className="text-[13px] leading-relaxed text-room-muted">{advice.howToBuy}</p>
            <p className="mt-3 text-[12px] leading-relaxed text-room-faint">
              These are recommendations, not listings — nothing here is for sale through us and
              we&rsquo;re not paid for the links. Fragrance is heavily counterfeited on secondhand
              marketplaces, which is why this page doesn&rsquo;t search them the way the rest of the
              site does.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function Choices<T extends string>({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: readonly { value: T; label: string; hint: string }[];
  selected: T;
  onSelect: (value: T) => void;
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
            onClick={() => onSelect(option.value)}
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
