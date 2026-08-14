"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CuratedItem } from "@/lib/curate";
import { PER_PAGE, RAIL, layout, pageCount, pageSlice } from "@/lib/wardrobe";
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

/** The rail leaving, and the rail arriving. Tuned against the keyframes. */
const LEAVE_MS = 420 + 8 * 38;
const ARRIVE_MS = 820 + 8 * 38;

/** How far a drag has to travel sideways before it counts as changing rails. */
const SWIPE_PX = 45;

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
  // Which rail is hanging, and whether one is currently being changed.
  const [page, setPage] = useState(0);
  const [swing, setSwing] = useState<"leaving" | "arriving" | null>(null);
  const swapping = useRef(false);
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

  // Read inside callbacks that mustn't re-create themselves when it changes.
  const configuredRef = useRef(false);
  configuredRef.current = taste?.configured === true;

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

  /**
   * Tell the server what was seen and what was acted on.
   *
   * Fire-and-forget: this is measurement, and a failed count must never surface
   * to someone looking at clothes. Sent in batches because a closet hangs
   * several pieces in one moment, and one request per piece would be several
   * read-modify-writes racing over the same counters.
   */
  const record = useCallback((events: Array<{ item: CuratedItem; signal: string }>) => {
    if (!configuredRef.current || !events.length) return;
    void fetch("/api/taste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: events.map(({ item, signal }) => ({
          title: item.title,
          signal,
          attrs: item.attrs,
          source: item.source,
          price: item.price,
        })),
      }),
    }).catch(() => {});
  }, []);

  // Which pieces have already been counted, so an impression is one impression
  // however many times the component re-renders around it.
  const counted = useRef(new Set<string>());

  /**
   * Every piece hanging counts as shown, once.
   *
   * `shown` is the denominator the rest of the statistics are meaningless
   * without: a material clicked twice is excellent if it appeared three times
   * and dismal if it appeared forty, and only impressions separate those.
   */
  useEffect(() => {
    if (phase !== "filled" || !taste?.configured) return;
    const fresh = items.filter((item) => !counted.current.has(item.id));
    if (!fresh.length) return;
    for (const item of fresh) counted.current.add(item.id);
    record(fresh.map((item) => ({ item, signal: "shown" })));
  }, [items, phase, taste?.configured, record]);

  // Opening the panel is a weaker signal than a click but a far commoner one,
  // and it's the only thing most people ever do. Counted once per piece.
  const opened = useRef(new Set<string>());
  useEffect(() => {
    if (!activeId || !taste?.configured || opened.current.has(activeId)) return;
    const item = items.find((candidate) => candidate.id === activeId);
    if (!item) return;
    opened.current.add(activeId);
    record([{ item, signal: "opened" }]);
  }, [activeId, items, taste?.configured, record]);

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
          attrs: item.attrs,
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

  const pages = pageCount(items.length);
  // Pages can vanish under you: batches land while you are browsing, and
  // removing a piece can shorten the closet.
  const safePage = Math.min(page, pages - 1);
  const shown = pageSlice(items, safePage);

  /**
   * Change rails.
   *
   * Two halves rather than one: the rail that is leaving has to be out of frame
   * before the next one is mounted, or both sets are on screen at once and the
   * illusion collapses into a crossfade. The ref guards against a second swipe
   * landing mid-swap, which would leave a rail half-animated.
   */
  const turn = useCallback(
    (delta: number) => {
      if (swapping.current) return;
      const next = safePage + delta;
      if (next < 0 || next >= pages) return;

      swapping.current = true;
      setActiveId(null);
      if (prefersReducedMotion()) {
        setPage(next);
        swapping.current = false;
        return;
      }

      setSwing("leaving");
      window.setTimeout(() => {
        setPage(next);
        setSwing("arriving");
        window.setTimeout(() => {
          setSwing(null);
          swapping.current = false;
        }, ARRIVE_MS);
      }, LEAVE_MS);
    },
    [pages, safePage]
  );

  // Swiping is the whole point on a phone, where there is no room for buttons
  // beside the wardrobe. Horizontal intent only: a mostly-vertical drag is the
  // page being scrolled and must not turn the rail.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const from = drag.current;
    drag.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    turn(dx < 0 ? 1 : -1);
  };

  const active = items.find((item) => item.id === activeId) ?? null;
  const showGarments = phase === "filled";

  // The rail that is hanging, not the whole closet. Laying out all twenty-four
  // put every visible bag in row one at a twelve-per-row width — the geometry
  // has to describe the eight actually on screen.
  const { width, height, slots, rowYs } = layout(shown.length);

  // Stagger positions, numbered within each arrival rather than across the whole
  // rail. Assigned once per piece and never reassigned, so a re-render can't
  // make something that's already hanging animate again.
  const staggerRef = useRef(new Map<string, number>());
  let arriving = 0;
  const stagger = items.map((item) => {
    const known = staggerRef.current.get(item.id);
    if (known !== undefined) return known;
    const position = arriving;
    arriving += 1;
    staggerRef.current.set(item.id, position);
    return position;
  });
  const canVote = taste?.configured === true;

  return (
    <div className="animate-fade-in" aria-live="polite" aria-busy={phase !== "filled"}>
      <div
        className="bleed relative touch-pan-y overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {/* The stage is narrower than the clip, on purpose. The wardrobe occupies
            the middle 44% of a 16:9 frame and the rest is empty room, so showing
            all of it spends most of the width on nothing and leaves the pieces
            too small to read. Cropping to 4:3 scales the wardrobe up by a third
            with no loss of detail — and portrait on phones, further still.

            The clip keeps its own aspect and overflows sideways, and because the
            cavity sits dead centre of the frame the crop lands on it almost
            exactly: no zoom state, no paging, and the garment coordinates below
            are untouched. */}
        <div className="relative aspect-[4/5] w-full sm:aspect-[4/3]">
          <div className="absolute left-1/2 top-0 h-full -translate-x-1/2">
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

              {/* The lower rail, which the footage doesn't have — the clip ends on
                  one wide cavity with a single rail across the top. Drawn only
                  when there are enough pieces to need a second row, and it
                  arrives with them rather than sitting in an empty wardrobe. */}
              {phase !== "building" &&
                rowYs.slice(1).map((y) => (
                  <span
                    key={y}
                    aria-hidden
                    className={`absolute z-[5] h-[2px] rounded-full bg-wardrobe-rail shadow-[0_2px_3px_rgba(27,26,23,0.3)] transition-opacity duration-500 ${
                      showGarments ? "opacity-90" : "opacity-0"
                    }`}
                    style={{
                      left: `${RAIL.left * 100}%`,
                      width: `${(RAIL.right - RAIL.left) * 100}%`,
                      top: `${y * 100}%`,
                    }}
                  />
                ))}

              {/* Garments only exist once the wardrobe is built and filled. */}
              {phase !== "building" &&
                shown.map((item, pageIndex) => {
                  const index = safePage * PER_PAGE + pageIndex;
                  return (
                  <GarmentBag
                    key={item.id}
                    item={item}
                    centreX={slots[pageIndex].x}
                    railY={slots[pageIndex].y}
                    width={width}
                    height={height}
                    index={index}
                    delayIndex={stagger[index]}
                    active={activeId === item.id}
                    hidden={!showGarments}
                    onEnter={(at) => openBag(item.id, at)}
                    onLeave={scheduleClose}
                    onToggle={() => toggleBag(item.id)}
                    swing={swing}
                    swingIndex={pageIndex}
                  />
                  );
                })}
            </div>
          </div>
        </div>

      </div>

      {/* Which rail you are on, and the way between them.

          Shown only when there is more than one, so a closet of six carries no
          chrome for a thing it cannot do. The dots are a position, not a
          control-per-piece: at three rails they are cheaper to read than "2 of
          3", and they stay honest as the count grows. */}
      {pages > 1 && phase === "filled" && (
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => turn(-1)}
            disabled={safePage === 0}
            aria-label="Previous pieces"
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-room-line text-room-muted transition-colors hover:border-room-ink/40 hover:text-room-ink disabled:opacity-30"
          >
            &larr;
          </button>

          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: pages }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === safePage ? "w-5 bg-room-ink" : "w-1.5 bg-room-line"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => turn(1)}
            disabled={safePage === pages - 1}
            aria-label="More pieces"
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-room-line text-room-muted transition-colors hover:border-room-ink/40 hover:text-room-ink disabled:opacity-30"
          >
            &rarr;
          </button>

          <span className="sr-only" aria-live="polite">
            Rail {safePage + 1} of {pages}
          </span>
        </div>
      )}

      {/* Detail for the open piece, below the wardrobe rather than beside the
          garment: even at this size a bag is too small to hold readable text,
          and a floating card would cover the pieces hanging next to it.

          Where a pointer is, it sits in a slot of its own with a reserved height
          instead of floating over the wardrobe — with two rows the lower one now
          hangs where an overlay would land, and a panel that covered half the
          clozet every time you moved the pointer was worse than the problem it
          solved. The height is reserved so the page doesn't jump on every hover;
          when nothing is open the slot holds the hint instead of sitting empty.
          On a phone none of that applies and it becomes a bottom sheet — see the
          note on the panel itself.

          It holds a link and buttons, so it has to take the pointer — and it
          stays open while the pointer is over either the bag or the panel, with
          a short delay so crossing the gap doesn't dismiss it. */}
      <div
        className={`relative transition-[min-height] duration-300 ${
          showGarments ? "mt-4 min-h-[72px] sm:min-h-[180px]" : "min-h-0"
        }`}
      >
        <p
          className={`absolute inset-x-0 top-4 text-center text-xs text-room-faint transition-opacity duration-200 sm:top-6 ${
            active || !showGarments ? "opacity-0" : "opacity-100"
          }`}
        >
          {canVote
            ? "Say yes or no on a piece and the next clozet is picked around it."
            : "Hover or tap a piece to see why it's here."}
        </p>

        {/*
          On a phone this is a sheet pinned to the bottom of the screen; from sm
          up it stays in the reserved slot below the wardrobe.

          The slot was the bug. A phone screen holds the header, the heading and
          a 4:5 wardrobe and nothing else, so the slot beneath it sat a couple of
          hundred pixels below the fold: tapping a piece opened a panel nobody
          could see, and the piece looked broken rather than busy. Pinning it to
          the viewport is the only placement that's guaranteed visible whatever
          the person has scrolled to — and it's what a phone does with detail
          anyway. The reserved height shrinks to just what the hint line needs,
          since nothing is going to land in it any more.
        */}
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={`fixed inset-x-0 bottom-0 z-40 flex justify-center transition-all duration-200 sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-0 sm:z-auto ${
            active
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-full opacity-0 sm:translate-y-2"
          }`}
        >
          <div className="panel relative w-full max-w-md rounded-b-none px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 text-left shadow-lift sm:rounded-b-2xl sm:py-3.5">
            <button
              type="button"
              onClick={(e) => dismiss(e)}
              aria-label="Close"
              className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full text-room-faint transition-colors hover:bg-room-sunk hover:text-room-ink sm:right-2.5 sm:top-2.5 sm:h-6 sm:w-6"
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
            {/* Clamped so the panel stays inside its reserved slot — eBay titles
                run to 80 characters of keyword stuffing. */}
            <p className="mb-1.5 line-clamp-2 text-sm font-medium leading-snug text-room-ink">
              {active?.title}
            </p>
            <p className="line-clamp-3 text-xs leading-relaxed text-room-muted">
              {active?.whyItFits}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-room-line pt-3">
              {/* The strongest signal anyone gives without pressing a button:
                  leaving for the listing itself. */}
              <a
                href={active?.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => active && record([{ item: active, signal: "clicked" }])}
                className="-my-2 py-2 text-xs font-semibold text-accent underline-offset-4 hover:underline sm:my-0 sm:py-0"
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
                        className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors sm:px-2.5 sm:py-1 ${
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

      {caption && phase !== "filled" && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <p className="text-sm tracking-wide text-room-muted">{caption}</p>
        </div>
      )}
    </div>
  );
}
