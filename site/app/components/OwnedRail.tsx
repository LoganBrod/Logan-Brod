"use client";

import { useEffect, useRef, useState } from "react";
import { garmentColour, isDark } from "@/lib/garmentColour";
import { RAIL, layout } from "@/lib/wardrobe";

export interface OwnedGarment {
  id: string;
  label: string;
  category: string;
  colour: string;
  material: string;
  season: string;
}

/** How much of the clip's ending to play. Enough to read as movement, not as a wait. */
const TAIL_SECONDS = 1.4;

/**
 * Your own wardrobe, as a wardrobe.
 *
 * The list this replaces was accurate and unreadable: twenty rows of "navy wool
 * crewneck · knitwear · navy · wool · cold" tells you what you own the way a
 * spreadsheet does. Hung on a rail, the same twenty are a glance — you can see
 * that it is all navy, or that there is nothing for summer, without reading a
 * word.
 *
 * There is no photograph to hang. The pictures are read once and thrown away,
 * which is the reason this feature needs no storage service, so each piece is
 * drawn as a bag in the colour the model recorded. That is honest about what
 * the app actually knows: it knows your grey crewneck is grey, and it does not
 * know what it looks like.
 */
export default function OwnedRail({
  items,
  onForget,
}: {
  items: OwnedGarment[];
  /** Absent while the wardrobe is read-only. */
  onForget?: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  /**
   * The doors finish opening, once, and then hold.
   *
   * Only the last stretch of the clip is played. The full thing is five
   * seconds, which is the right length after a closet run — you have already
   * waited minutes for the search, and the wardrobe opening is the payoff. It
   * is the wrong length for a page you check to see what you own: five seconds
   * of furniture before your own clothes appear, every single visit.
   *
   * Starting near the end keeps the movement and drops the waiting. Anyone who
   * has asked for less motion gets the final frame outright.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const settle = () => {
      const end = Number.isFinite(video.duration) ? video.duration : 0;
      if (reducedMotion()) {
        video.currentTime = end;
        setOpen(true);
        return;
      }
      video.currentTime = Math.max(0, end - TAIL_SECONDS);
      video.play().catch(() => setOpen(true));
    };

    if (video.readyState >= 1) settle();
    else video.addEventListener("loadedmetadata", settle, { once: true });

    return () => video.removeEventListener("loadedmetadata", settle);
  }, []);

  const { width, height, slots, rowYs } = layout(items.length);
  const active = items.find((item) => item.id === activeId) ?? null;

  return (
    <div className="space-y-3">
      <div className="bleed relative overflow-hidden">
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
                onEnded={() => setOpen(true)}
              >
                <source src="/closet-building.webm" type="video/webm" />
                <source src="/closet-building.mp4" type="video/mp4" />
              </video>

              {/* The lower rail isn't in the footage; it arrives with the pieces
                  that need it rather than sitting in an empty wardrobe. */}
              {rowYs.slice(1).map((y) => (
                <span
                  key={y}
                  aria-hidden
                  className={`absolute z-[5] h-[2px] rounded-full bg-wardrobe-rail shadow-[0_2px_3px_rgba(27,26,23,0.3)] transition-opacity duration-500 ${
                    open ? "opacity-90" : "opacity-0"
                  }`}
                  style={{
                    left: `${RAIL.left * 100}%`,
                    width: `${(RAIL.right - RAIL.left) * 100}%`,
                    top: `${y * 100}%`,
                  }}
                />
              ))}

              {items.map((item, index) => {
                const slot = slots[index];
                if (!slot) return null;
                const colour = garmentColour(`${item.colour} ${item.label}`);
                const selected = activeId === item.id;
                // Stable, not random: a tilt that changed on every render would
                // fight React and read as a twitch rather than as hanging.
                const tilt = (index % 2 === 0 ? 1 : -1) * (0.6 + (index % 3) * 0.3);

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-owned={item.id}
                    onClick={() => setActiveId(selected ? null : item.id)}
                    aria-pressed={selected}
                    aria-label={`${item.label}, ${item.colour} ${item.material}`}
                    className="absolute block cursor-pointer outline-none transition-[transform,opacity] duration-500 ease-out focus-visible:ring-2 focus-visible:ring-accent"
                    style={{
                      left: `${slot.x * 100}%`,
                      top: `${slot.y * 100}%`,
                      width: `${width * 100}%`,
                      height: `${height * 100}%`,
                      transformOrigin: "top center",
                      transform: `translateX(-50%) rotate(${selected ? 0 : tilt}deg) ${
                        selected ? "scale(1.14)" : "scale(1)"
                      } ${open ? "" : "translateY(-14%)"}`,
                      opacity: open ? 1 : 0,
                      // They drop in one after another rather than all at once.
                      transitionDelay: open ? `${index * 45}ms` : "0ms",
                      zIndex: selected ? 40 : 10 + index,
                    }}
                  >
                    {/* The hook, over the rail rather than below it. */}
                    <span
                      aria-hidden
                      className="absolute left-1/2 top-0 h-[7%] w-[9%] -translate-x-1/2 -translate-y-[85%] rounded-t-full border-[1.5px] border-b-0 border-wardrobe-rail"
                    />
                    <span
                      className="bag-shape absolute inset-0 block shadow-[0_10px_14px_rgba(27,26,23,0.28)]"
                      style={{ backgroundColor: colour }}
                    >
                      {/* The sheen that makes a flat fill read as a bag. */}
                      <span aria-hidden className="bag-face absolute inset-0 block opacity-40" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* One reserved slot below, so the wardrobe doesn't jump when a piece is
          selected and nothing is ever hidden behind the pieces themselves. */}
      <div className="min-h-[76px]">
        {active ? (
          <div className="panel flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-room-ink">{active.label}</p>
              <p className="mt-0.5 text-xs text-room-faint">
                {active.category} &middot; {active.colour} &middot; {active.material} &middot;{" "}
                {active.season}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-5 w-5 rounded-sm border border-room-line"
                style={{ backgroundColor: garmentColour(`${active.colour} ${active.label}`) }}
              />
              {onForget && (
                <button
                  type="button"
                  onClick={() => {
                    onForget(active.id);
                    setActiveId(null);
                  }}
                  className="text-xs text-room-faint hover:text-room-ink"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="pt-3 text-center text-xs text-room-faint">
            {items.length === 1 ? "One piece" : `${items.length} pieces`} &mdash; tap any of them to
            see what the app read.
          </p>
        )}
      </div>
    </div>
  );
}

/** Local rather than imported: this file has no other reason to reach into the stage. */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Text on a swatch, for anywhere that needs it. Exported so the colour rules stay in one place. */
export function labelColourFor(colour: string): string {
  return isDark(garmentColour(colour)) ? "#F2F1ED" : "#131211";
}
