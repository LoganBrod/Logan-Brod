"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductListing } from "@/lib/sources/types";

type Card = ProductListing & { slot?: string; register?: string | null };

/**
 * Fifteen pieces, yes or no.
 *
 * The taste memory is the strongest signal this app has and it only exists
 * after somebody has built a closet and reacted to it — so the very first run,
 * the one that decides whether anyone comes back, has none of it. A minute of
 * swiping fills that in before it matters.
 *
 * The votes go to the same endpoint the closet's own thumbs do, so there is no
 * second store and no second format: what someone says here is worth exactly
 * what saying it about a finished closet is worth.
 */
export default function CalibrationSwipe() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ yes: 0, no: 0 });
  const [leaving, setLeaving] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/calibrate")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Couldn't load anything."))))
      .then((json) => {
        if (!alive) return;
        if (!json.cards?.length) throw new Error("No pieces came back. Try again in a moment.");
        setCards(json.cards as Card[]);
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  const current = cards?.[index];
  const done = Boolean(cards && index >= cards.length);

  const vote = useCallback(
    (verdict: "yes" | "no") => {
      const card = cards?.[index];
      if (!card) return;

      setLeaving(verdict);
      setCounts((c) => ({ ...c, [verdict]: c[verdict] + 1 }));

      // Unacknowledged, like every other vote in the app: a card that waited on
      // the network before turning over would make a minute feel like five.
      void fetch("/api/taste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: card.title,
          verdict,
          source: card.source,
          price: card.price,
        }),
      }).catch(() => {});

      // Long enough to read as the card leaving, short enough not to be a wait.
      window.setTimeout(() => {
        setLeaving(null);
        setIndex((i) => i + 1);
      }, 160);
    },
    [cards, index]
  );

  // Arrow keys, because anyone doing fifteen of these on a laptop will reach
  // for them within about three cards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") vote("no");
      if (e.key === "ArrowRight") vote("yes");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vote]);

  // Drag to swipe. Pointer events rather than touch, so a mouse works too.
  const from = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const SWIPE_PX = 60;

  if (error) {
    return (
      <div className="panel px-6 py-8 text-center">
        <p className="text-sm text-room-muted">{error}</p>
      </div>
    );
  }

  if (!cards) {
    return (
      <div className="panel flex min-h-[26rem] items-center justify-center px-6 py-8">
        <p className="text-sm text-room-faint">Finding a few things to show you…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="panel px-6 py-10 text-center">
        <p className="eyebrow mb-3">That&rsquo;s it</p>
        <h2 className="text-[1.6rem] font-semibold tracking-[-0.02em] text-room-ink">
          {counts.yes} yes, {counts.no} no.
        </h2>
        <p className="mx-auto mt-4 max-w-[46ch] text-sm leading-relaxed text-room-muted">
          That goes into every search from here on — what you turned down as much as what you kept.
          It gets sharper every time you react to a clozet, too.
        </p>
        <Link href="/closet" className="btn-primary mt-7 inline-block">
          Build your clozet
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <p className="label">
          {index + 1} of {cards.length}
        </p>
        <p className="font-mono text-[12px] tabular-nums text-room-faint">
          {counts.yes} kept · {counts.no} passed
        </p>
      </div>

      <div
        className="panel relative touch-pan-y select-none overflow-hidden"
        onPointerDown={(e) => {
          from.current = e.clientX;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (from.current !== null) setDrag(e.clientX - from.current);
        }}
        onPointerUp={() => {
          if (from.current !== null && Math.abs(drag) > SWIPE_PX) vote(drag > 0 ? "yes" : "no");
          from.current = null;
          setDrag(0);
        }}
        onPointerCancel={() => {
          from.current = null;
          setDrag(0);
        }}
      >
        <div
          className={`transition-all duration-150 ${
            leaving === "yes"
              ? "translate-x-16 opacity-0"
              : leaving === "no"
                ? "-translate-x-16 opacity-0"
                : ""
          }`}
          style={leaving ? undefined : { transform: `translateX(${drag * 0.4}px)` }}
        >
          {/* object-contain on white, for the same reason the accessories grid
              uses it: these are seller photographs at every aspect ratio there
              is, and a common crop cuts the toes off boots. */}
          <div className="flex h-[22rem] items-center justify-center bg-white p-4">
            {current?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.imageUrl}
                alt={current.title}
                draggable={false}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-sm text-room-faint">No photo</span>
            )}
          </div>
          <div className="px-6 py-4">
            <p className="text-[14px] font-medium leading-snug text-room-ink line-clamp-2">
              {current?.title}
            </p>
            {/* No price and no register on the card. This is asking whether you
                like the look of it; a price turns it into a question about your
                budget, and naming the register tells you the answer. */}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => vote("no")} className="btn-ghost">
          Not for me
        </button>
        <button type="button" onClick={() => vote("yes")} className="btn-primary">
          I&rsquo;d wear this
        </button>
      </div>

      <p className="mt-3 text-center text-[11px] text-room-faint">
        Swipe, or use the arrow keys.
      </p>
    </div>
  );
}
