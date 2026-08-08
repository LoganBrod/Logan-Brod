"use client";

import type { CuratedItem } from "@/lib/curate";
import type { Bay } from "@/lib/wardrobe";
import Hanger from "./Hanger";

/**
 * One garment hanging on the rail, positioned as a fraction of the wardrobe
 * frame behind it. Every coordinate comes from `lib/wardrobe.ts`, which is
 * measured against the video's final frame — nothing here guesses.
 *
 * The anchor carries the explicit width and height so its children can size in
 * percentages; laying the card out from its own image aspect leaves most of a
 * full-height bay empty.
 */
export default function HungGarment({
  item,
  bay,
  centreX,
  width,
  height,
  index,
  active,
  hidden,
  onEnter,
  onLeave,
}: {
  item: CuratedItem;
  bay: Bay;
  /** Centre of the garment, as a fraction of the frame width. */
  centreX: number;
  /** Garment width, as a fraction of the frame width. */
  width: number;
  /** How far it hangs below the rail, as a fraction of the frame height. */
  height: number;
  index: number;
  active: boolean;
  /** True once results exist but this piece hasn't dropped in yet. */
  hidden: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={(e) => {
        // First tap on touch reveals the piece; the second opens the listing.
        if (!active && window.matchMedia("(hover: none)").matches) {
          e.preventDefault();
          onEnter();
        }
      }}
      aria-label={`${item.title}, $${item.price.toFixed(2)}`}
      className="absolute block outline-none transition-[transform,opacity] duration-500 ease-out focus-visible:ring-2 focus-visible:ring-accent"
      style={{
        left: `${centreX * 100}%`,
        top: `${bay.railY * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
        // A touch of tilt, alternating and derived from the index so it's stable
        // across renders. Perfectly upright garments read as pasted rectangles;
        // the hovered one straightens as it lifts.
        transform: `translateX(-50%) rotate(${
          active ? 0 : (index % 2 === 0 ? 1 : -1) * (0.7 + (index % 3) * 0.35)
        }deg) ${active ? "scale(1.14)" : "scale(1)"} ${hidden ? "translateY(-14%)" : ""}`,
        // Scales from the rail, the way a hung garment would swing.
        transformOrigin: "top center",
        opacity: hidden ? 0 : 1,
        // Pieces drop in one after another rather than arriving all at once.
        transitionDelay: hidden ? "0ms" : `${index * 90}ms`,
        zIndex: active ? 40 : 10 + index,
      }}
    >
      {/* Sits over the rail rather than below it. */}
      <div className="absolute inset-x-0 -top-[9%] z-10 flex justify-center text-wardrobe-rail">
        <Hanger className="h-auto w-3/5 drop-shadow-sm" />
      </div>

      <div
        className={`h-full overflow-hidden rounded-[3px] bg-white ring-1 transition-shadow ${
          active ? "shadow-lift ring-room-ink/25" : "shadow-hang ring-black/10"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
    </a>
  );
}
