"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACCESSORY_KINDS, MAX_KINDS, isAccessoryKind, type AccessoryKind } from "@/lib/accessoryKinds";
import type { CuratedItem } from "@/lib/curate";

interface Result {
  items: CuratedItem[];
  summary: string;
  basedOn: { code: string; createdAt: string };
  notes: string;
}

/**
 * Accessories, against a style you already established.
 *
 * No upload. Nobody has photographs of belts to hand, and asking for them would
 * mean a second full-price run for the cheapest part of an outfit — so this
 * reads the profile from the last clozet and asks only which kinds of thing
 * you're after.
 *
 * Results are a grid rather than the wardrobe. The rail is a good joke about
 * hanging clothes; a belt on a hanger is just a worse photograph.
 */
export default function AccessoryFinder() {
  /*
   * Arriving from a finished clozet.
   *
   * `from` names the clozet to match against, so the answer is tied to the one
   * that was on screen rather than to whichever happens to be newest - two tabs
   * open, or a clozet built on a phone while an older one sits open on a
   * laptop, and "newest" is the wrong wardrobe.
   *
   * `kinds` preselects the picker, because the offer on the clozet page was
   * specific and landing on a blank form makes the person redo the choice it
   * implied was already made.
   *
   * Read once into state rather than used directly: everything here stays
   * editable, so the link is a starting position and not a lock.
   */
  const params = useSearchParams();
  const from = params.get("from");
  const [kinds, setKinds] = useState<AccessoryKind[]>(() =>
    (params.get("kinds") ?? "")
      .split(",")
      .filter(isAccessoryKind)
      .slice(0, MAX_KINDS)
  );
  const [min, setMin] = useState(20);
  const [max, setMax] = useState(150);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCloset, setNeedsCloset] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const atLimit = kinds.length >= MAX_KINDS;

  const toggle = (kind: AccessoryKind) =>
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((k) => k !== kind)
        : current.length >= MAX_KINDS
          ? current
          : [...current, kind]
    );

  async function run() {
    if (!kinds.length) {
      setError("Pick at least one kind.");
      return;
    }
    if (max <= min) {
      setError("The maximum has to be above the minimum.");
      return;
    }

    setBusy(true);
    setError(null);
    setNeedsCloset(false);
    try {
      const res = await fetch("/api/accessories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kinds, min, max, code: from }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNeedsCloset(Boolean(json?.needsCloset));
        throw new Error(json?.error ?? "That didn't work.");
      }
      setResult(json as Result);
      if (!json.items?.length) {
        setError("Nothing cleared the bar this time. Try a wider price range, or another kind.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Said out loud, because otherwise the connection is invisible: the
          person clicked "match accessories" on a clozet and has no way to know
          whether this page heard that. */}
      {from && (
        <p className="mb-8 border-l-2 border-accent pl-4 text-[13px] leading-relaxed text-room-muted">
          Matched to the clozet you just built. Everything below is judged against its palette and
          register, and you can change any of it.
        </p>
      )}
    <div className="space-y-10">
      <section className="panel px-6 py-6">
        <p className="label mb-2">What are you after?</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {ACCESSORY_KINDS.map((kind) => {
            const on = kinds.includes(kind.value);
            return (
              <button
                key={kind.value}
                type="button"
                aria-pressed={on}
                disabled={busy || (atLimit && !on)}
                onClick={() => toggle(kind.value)}
                className={`rounded-sm border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  on
                    ? "border-room-ink bg-room-ink text-room-on-ink"
                    : "border-room-line bg-room-panel hover:border-room-ink/40"
                }`}
              >
                <span className="block text-[13px] font-medium leading-tight">{kind.label}</span>
                <span
                  className={`mt-0.5 block text-[11px] leading-snug ${
                    on ? "text-room-on-ink/70" : "text-room-faint"
                  }`}
                >
                  {kind.hint}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-room-faint">
          {atLimit
            ? `${MAX_KINDS} at a time - more than that and each one gets a thinner search.`
            : `Up to ${MAX_KINDS} at a time.`}
        </p>

        <div className="mt-6 grid grid-cols-2 items-end gap-4 sm:flex sm:flex-wrap">
          <div>
            <label htmlFor="acc-min" className="label mb-2 block">
              Min per piece
            </label>
            <input
              id="acc-min"
              type="number"
              min={0}
              value={min}
              disabled={busy}
              onChange={(e) => setMin(Number(e.target.value))}
              className="field w-full sm:w-28"
            />
          </div>
          <div>
            <label htmlFor="acc-max" className="label mb-2 block">
              Max per piece
            </label>
            <input
              id="acc-max"
              type="number"
              min={0}
              value={max}
              disabled={busy}
              onChange={(e) => setMax(Number(e.target.value))}
              className="field w-full sm:w-28"
            />
          </div>
          <button
            type="button"
            onClick={run}
            disabled={busy || !kinds.length}
            className="btn-primary col-span-2 w-full sm:ml-auto sm:w-auto"
          >
            {busy ? "Looking…" : "Find accessories"}
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-sm border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{error}</p>
            {needsCloset && (
              <Link href="/closet" className="mt-2 inline-block font-semibold underline">
                Build a clozet first &rarr;
              </Link>
            )}
          </div>
        )}
      </section>

      {result && result.items.length > 0 && (
        <section aria-label="Accessories found">
          {result.summary && (
            <p className="mb-6 max-w-[58ch] text-sm leading-relaxed text-room-muted">
              {result.summary}
            </p>
          )}

          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-room-line bg-room-line sm:grid-cols-3 lg:grid-cols-4">
            {result.items.map((item) => (
              <li key={item.id} className="bg-room-panel">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full flex-col"
                >
                  {/* object-contain on white: these are seller photographs at
                      every aspect ratio there is, and cropping them to a common
                      box cuts the ends off belts and the brims off caps. */}
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-white p-3">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="text-[11px] text-room-faint">No photo</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col px-4 py-3.5">
                    <p className="text-[13px] font-medium leading-snug text-room-ink line-clamp-2">
                      {item.title}
                    </p>
                    <p className="mt-1 font-mono text-[12px] tabular-nums text-room-muted">
                      ${item.price.toFixed(2)}
                      {item.condition ? ` · ${item.condition}` : ""}
                    </p>
                    <p className="mt-2 text-[12px] leading-relaxed text-room-faint">
                      {item.whyItFits}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[11px] leading-relaxed text-room-faint">
            Chosen against the clozet you built on{" "}
            {new Date(result.basedOn.createdAt).toLocaleDateString()}. Build a new one and these
            change with it.
          </p>
        </section>
      )}
    </div>
    </>
  );
}
