"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CuratedItem } from "@/lib/curate";
import {
  BAYS,
  CARCASS,
  dealToBays,
  garmentHeight,
  garmentWidth,
  hangPositions,
} from "@/lib/wardrobe";
import HungGarment from "./HungGarment";

export type StagePhase = "building" | "open" | "filled";

const SOURCE_LABEL: Record<string, string> = { ebay: "eBay", serpapi: "Retail" };

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
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
  const [bay, setBay] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  // Below `md` a 16:9 wardrobe leaves garments too small to read, so one bay
  // fills the width instead and you swipe between them.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setZoomed(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  const touchX = useRef<number | null>(null);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      touchX.current = null;
      if (Math.abs(dx) < 40) return;
      setBay((b) => Math.min(BAYS.length - 1, Math.max(0, b + (dx < 0 ? 1 : -1))));
    },
    []
  );

  const dealt = dealToBays(items);
  const active = items.find((i) => i.id === activeId) ?? null;
  const showGarments = phase === "filled";

  // Zooming to a bay: map its box to the container with the origin at top-left.
  const current = BAYS[bay];
  const scale = zoomed ? 1 / (current.right - current.left) : 1;
  const transform = zoomed
    ? `scale(${scale}) translate(-${current.left * 100}%, -${CARCASS.top * 100}%)`
    : undefined;

  return (
    <div className="animate-fade-in" aria-live="polite" aria-busy={phase !== "filled"}>
      <div
        className="relative overflow-hidden rounded-2xl bg-room-bg"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="relative aspect-video w-full origin-top-left transition-transform duration-500 ease-out"
          style={{ transform }}
        >
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
            dealt.map((bayItems, b) =>
              bayItems.map((item, i) => {
                const width = garmentWidth(BAYS[b], bayItems.length);
                const positions = hangPositions(BAYS[b], bayItems.length, width);
                return (
                  <HungGarment
                    key={item.id}
                    item={item}
                    bay={BAYS[b]}
                    centreX={positions[i]}
                    width={width}
                    height={garmentHeight(BAYS[b])}
                    index={b * 5 + i}
                    active={activeId === item.id}
                    hidden={!showGarments}
                    onEnter={() => setActiveId(item.id)}
                    onLeave={() => setActiveId(null)}
                  />
                );
              })
            )}
        </div>

        {/* Detail for the hovered piece. Anchored under the wardrobe rather than
            beside the garment: at this scale a garment is ~80px wide, far too
            small to hold readable text, and a floating card would cover the
            pieces hanging next to it. */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 transition-all duration-200 sm:p-6 ${
            active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <div className="panel max-w-md px-5 py-3.5 text-left shadow-lift">
            <div className="mb-1 flex items-baseline justify-between gap-3">
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
          </div>
        </div>
      </div>

      {zoomed && phase === "filled" && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {BAYS.map((b, i) => (
            <button
              key={b.name}
              type="button"
              onClick={() => setBay(i)}
              aria-label={`Show the ${b.name.toLowerCase()} rail`}
              className={`h-1.5 rounded-full transition-all ${
                i === bay ? "w-6 bg-room-ink" : "w-1.5 bg-room-line"
              }`}
            />
          ))}
        </div>
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
