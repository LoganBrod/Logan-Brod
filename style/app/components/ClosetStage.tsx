"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CuratedItem } from "@/lib/curate";
import { RAIL, bagHeight, bagWidth, hangPositions } from "@/lib/wardrobe";
import GarmentBag from "./GarmentBag";

export type StagePhase = "building" | "open" | "filled";

type Verdict = "yes" | "no";

const SOURCE_LABEL: Record<string, string> = { ebay: "eBay", serpapi: "Retail" };

/**
 * How long the panel survives the pointer leaving. Long enough to cross the gap
 * between a garment and the panel below it, short enough that it doesn't feel
 * stuck open.
 */
const CLOSE_DELAY_MS = 220;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface TasteState {
  configured: boolean;
  verdicts: Record<string, Verdict>;
}

/**
 * The wardrobe, and everything hanging in it.
 *
 * The backdrop is the loading clip paused on its final frame — not a drawing of
 * a closet, the closet itself. Garments are placed over it in fractions of the
 * frame, so they stay aligned at any size.
 */
export default function ClosetStage({
  items,
  phase,
  caption,
  onBuilt,
}: {
  items: CuratedItem[];
  phase: StagePhase;
  /** Progress line shown while the pipeline is still running. */
  caption?: string;
  /** Fires when the build animation reaches its final frame. */
  onBuilt?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [taste, setTaste] = useState<TasteState | null>(null);
  const [votes, setVotes] = useState<Record<string, Verdict>>({});
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || phase !== "building") return;

    if (prefersReducedMotion()) {
      onBuilt?.();
      return;
    }
    // A refused autoplay would strand the sequence, so treat it as built.
    void video.play().catch(() => onBuilt?.());
  }, [phase, onBuilt]);

  // Whether feedback is even available, and what this browser already said. A
  // failure here is silence, not an error: voting is optional, and the request
  // also mints the id cookie so there's somewhere to put the first vote.
  useEffect(() => {
    let alive = true;
    fetch("/api/taste")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: (TasteState & { verdicts?: Record<string, Verdict> }) | null) => {
        if (!alive || !json) return;
        setTaste({ configured: Boolean(json.configured), verdicts: json.verdicts ?? {} });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Seed each item's vote from what's already stored, matched on title — the
  // listing id changes between runs, the title is what was actually judged.
  useEffect(() => {
    if (!taste) return;
    setVotes((current) => {
      const next = { ...current };
      for (const item of items) {
        const stored = taste.verdicts[item.title.trim().toLowerCase()];
        if (stored && !next[item.id]) next[item.id] = stored;
      }
      return next;
    });
  }, [taste, items]);

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!pinnedRef.current) setActiveId(null);
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Where the pointer was when the panel was last dismissed by hand.
  //
  // Closing the panel takes it out of hit-testing, so the browser immediately
  // fires mouseenter on whatever bag was behind it — with the pointer never
  // having moved — and the panel springs straight back open on a different
  // piece. A hover arriving from the exact spot the close was clicked is that
  // echo, not an intent, so it's ignored; anything a few pixels away is real.
  const dismissedAt = useRef<{ x: number; y: number } | null>(null);

  const openBag = useCallback(
    (id: string, at?: { x: number; y: number }) => {
      const from = dismissedAt.current;
      if (from && at && Math.abs(at.x - from.x) < 3 && Math.abs(at.y - from.y) < 3) return;
      dismissedAt.current = null;

      cancelClose();
      setActiveId(id);
      // Hovering a different piece releases whatever was pinned, so the panel
      // always describes what the pointer is actually on.
      setPinned(false);
    },
    [cancelClose]
  );

  // Reads the current selection from a ref rather than a state updater: an
  // updater has to be pure, and StrictMode double-invokes it.
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  const toggleBag = useCallback(
    (id: string) => {
      cancelClose();
      if (activeRef.current === id && pinnedRef.current) {
        setPinned(false);
        setActiveId(null);
        return;
      }
      setActiveId(id);
      setPinned(true);
    },
    [cancelClose]
  );

  const dismiss = useCallback(
    (event?: { clientX: number; clientY: number }) => {
      cancelClose();
      setPinned(false);
      setActiveId(null);
      dismissedAt.current = event ? { x: event.clientX, y: event.clientY } : null;
    },
    [cancelClose]
  );

  const vote = useCallback(async (item: CuratedItem, verdict: Verdict) => {
    setVoteError(null);
    const previous = votes[item.id];
    setVotes((current) => ({ ...current, [item.id]: verdict }));

    try {
      const res = await fetch("/api/taste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          verdict,
          source: item.source,
          price: item.price,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Couldn't save that (${res.status}).`);
      }
    } catch (err) {
      // Roll the button back rather than leaving it showing a choice that was
      // never recorded.
      setVotes((current) => {
        const next = { ...current };
        if (previous) next[item.id] = previous;
        else delete next[item.id];
        return next;
      });
      setVoteError(err instanceof Error ? err.message : "Couldn't save that.");
    }
  }, [votes]);

  const active = items.find((item) => item.id === activeId) ?? null;
  const showGarments = phase === "filled";

  const width = bagWidth(items.length);
  const height = bagHeight();
  const positions = hangPositions(items.length, width);
  const canVote = taste?.configured === true;

  return (
    <div className="animate-fade-in" aria-live="polite" aria-busy={phase !== "filled"}>
      <div className="relative overflow-hidden rounded-2xl bg-room-bg">
        {/* Portrait on phones, where a 16:9 wardrobe leaves the pieces too small
            to read or tap. The clip keeps its aspect and overflows sideways, and
            because the cavity sits dead centre of the frame the crop lands on it
            almost exactly — no zoom state, no paging. */}
        <div className="relative aspect-[4/5] w-full sm:aspect-video">
          <div className="absolute left-1/2 top-0 h-full -translate-x-1/2 sm:left-0 sm:w-full sm:translate-x-0">
            <div className="relative aspect-video h-full">
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                poster="/closet-building.jpg"
                muted
                playsInline
                preload="auto"
                onEnded={onBuilt}
              >
                {/* WebM first for Chromium builds without proprietary codecs; MP4
                    second for Safari and iOS, which won't decode VP9 in <video>. */}
                <source src="/closet-building.webm" type="video/webm" />
                <source src="/closet-building.mp4" type="video/mp4" />
              </video>

              {/* Garments only exist once the wardrobe is built and filled. */}
              {phase !== "building" &&
                items.map((item, index) => (
                  <GarmentBag
                    key={item.id}
                    item={item}
                    centreX={positions[index]}
                    railY={RAIL.y}
                    width={width}
                    height={height}
                    index={index}
                    active={activeId === item.id}
                    hidden={!showGarments}
                    onEnter={(at) => openBag(item.id, at)}
                    onLeave={scheduleClose}
                    onToggle={() => toggleBag(item.id)}
                  />
                ))}
            </div>
          </div>
        </div>

        {/* Detail for the open piece. Anchored under the wardrobe rather than
            beside the garment: at this scale a bag is ~80px wide, far too small
            to hold readable text, and a floating card would cover the pieces
            hanging next to it.

            It holds a link and buttons now, so it has to take the pointer — and
            it stays open while the pointer is over either the bag or the panel,
            with a short delay so crossing the gap doesn't dismiss it.

            z-50 puts it over the garments, which carry z-indexes of their own so
            the hovered one lifts above its neighbours. Without it the piece
            hanging in front swallows clicks meant for the link or the buttons. */}
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={`absolute inset-x-0 bottom-0 z-50 flex justify-center p-3 transition-all duration-200 sm:p-6 ${
            active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          <div className="panel relative w-full max-w-md px-5 py-3.5 text-left shadow-lift">
            <button
              type="button"
              onClick={(e) => dismiss(e)}
              aria-label="Close"
              className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-room-faint transition-colors hover:bg-room-sunk hover:text-room-ink"
            >
              &times;
            </button>

            <div className="mb-1 flex items-baseline gap-3 pr-7">
              <span className="font-semibold text-room-ink">
                ${active?.price.toFixed(2)}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-room-faint">
                {active ? SOURCE_LABEL[active.source] ?? active.source : ""}
                {active?.condition ? ` · ${active.condition}` : ""}
              </span>
            </div>
            <p className="mb-1.5 text-sm font-medium leading-snug text-room-ink">
              {active?.title}
            </p>
            <p className="text-xs leading-relaxed text-room-muted">{active?.whyItFits}</p>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-room-line pt-3">
              <a
                href={active?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-accent underline-offset-4 hover:underline"
              >
                View the listing &rarr;
              </a>

              {canVote && active && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-room-faint">
                    Right for you?
                  </span>
                  {(["yes", "no"] as const).map((verdict) => {
                    const chosen = votes[active.id] === verdict;
                    return (
                      <button
                        key={verdict}
                        type="button"
                        onClick={() => vote(active, verdict)}
                        aria-pressed={chosen}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          chosen
                            ? "border-room-ink bg-room-ink text-room-bg"
                            : "border-room-line text-room-muted hover:border-room-ink/40 hover:text-room-ink"
                        }`}
                      >
                        {verdict === "yes" ? "Yes" : "No"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {voteError && (
              <p className="mt-2 text-[11px] leading-relaxed text-red-700">{voteError}</p>
            )}
          </div>
        </div>
      </div>

      {canVote && phase === "filled" && items.length > 0 && (
        <p className="mt-4 text-center text-xs text-room-faint">
          Say yes or no on a piece and the next closet is picked around it.
        </p>
      )}

      {caption && phase !== "filled" && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <p className="text-sm tracking-wide text-room-muted">{caption}</p>
        </div>
      )}
    </div>
  );
}
