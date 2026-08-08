"use client";

import { useRef } from "react";
import type { CuratedItem } from "@/lib/curate";

/**
 * The bag's outline, as percentages: a narrow neck at the hook, shoulders
 * curving out to full width, chamfered at the hem. Written once in both the
 * clip-path and the SVG stroke forms so the seam can never drift from the shape
 * it traces.
 *
 * The shoulders are a curve rather than the two straight lines they used to be.
 * A straight taper is fine on a narrow bag, but these are now wide enough that
 * it read as an envelope flap — the slope has to steepen as the bag widens, and
 * only a curve does that.
 */
const BAG_POINTS =
  "46,0 54,0 66,2 78,6 89,12 96,17 100,22 100,95 96,100 4,100 0,95 0,22 4,17 11,12 22,6 34,2";
const BAG_SHAPE = `polygon(${BAG_POINTS.split(" ")
  .map((point) => point.split(",").map((n) => `${n}%`).join(" "))
  .join(", ")})`;

/**
 * One piece hanging on the rail, inside a garment bag.
 *
 * The bag exists to solve a real problem, not as decoration: eBay photos come in
 * every aspect ratio and framing there is, and forcing them into a common box
 * cut the toes off boots and the shoulders off jackets. A translucent bag is a
 * uniform shape that a photo can sit *inside* rather than be cropped to — at
 * rest you see a blurred, dimmed silhouette, which still reads as a coat or a
 * boot, and on hover the frost clears and the photo shows whole.
 *
 * Every coordinate is a fraction of the video frame behind it, from
 * `lib/wardrobe.ts`, which is measured against the clip's final frame.
 */
export default function GarmentBag({
  item,
  centreX,
  railY,
  width,
  height,
  index,
  active,
  hidden,
  onEnter,
  onLeave,
  onToggle,
}: {
  item: CuratedItem;
  /** Centre of the bag, as a fraction of the frame width. */
  centreX: number;
  /** The rail it hangs from, as a fraction of the frame height. */
  railY: number;
  /** Bag width, as a fraction of the frame width. */
  width: number;
  /** How far it hangs below the rail, as a fraction of the frame height. */
  height: number;
  index: number;
  active: boolean;
  /** True once results exist but this piece hasn't dropped in yet. */
  hidden: boolean;
  /** Carries the pointer position, which the stage uses to tell a real hover from an echo. */
  onEnter: (at?: { x: number; y: number }) => void;
  onLeave: () => void;
  /** Click, tap, or Enter/Space — pins the detail panel open. */
  onToggle: () => void;
}) {
  // Touch has to be handled explicitly rather than left to the emulated mouse
  // events. Tapping a bag in mobile Chromium fires mouseenter, then mouseleave
  // as the finger lifts, and *no click at all* — so the hover path opened the
  // panel and immediately closed it again, and the tap could never pin it.
  const touch = useRef(false);

  return (
    <button
      type="button"
      data-garment={item.id}
      onPointerDown={(e) => {
        touch.current = e.pointerType !== "mouse";
        if (touch.current) onToggle();
      }}
      onMouseEnter={(e) => !touch.current && onEnter({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => !touch.current && onLeave()}
      onFocus={() => !touch.current && onEnter()}
      onClick={() => !touch.current && onToggle()}
      aria-label={`${item.title}, $${item.price.toFixed(2)}`}
      aria-expanded={active}
      className="absolute block cursor-pointer outline-none transition-[transform,opacity] duration-500 ease-out focus-visible:ring-2 focus-visible:ring-accent"
      style={{
        left: `${centreX * 100}%`,
        top: `${railY * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
        // A touch of tilt, alternating and derived from the index so it's stable
        // across renders. Perfectly upright bags read as pasted rectangles; the
        // hovered one straightens as it lifts.
        transform: `translateX(-50%) rotate(${
          active ? 0 : (index % 2 === 0 ? 1 : -1) * (0.7 + (index % 3) * 0.35)
        }deg) ${active ? "scale(1.16)" : "scale(1)"} ${hidden ? "translateY(-14%)" : ""}`,
        // Scales from the rail, the way a hung garment would swing.
        transformOrigin: "top center",
        opacity: hidden ? 0 : 1,
        // Pieces drop in one after another rather than arriving all at once.
        transitionDelay: hidden ? "0ms" : `${index * 90}ms`,
        zIndex: active ? 40 : 10 + index,
      }}
    >
      {/* The hook, sitting over the rail rather than below it. */}
      <span
        aria-hidden
        className="absolute left-1/2 top-0 h-[7%] w-[9%] -translate-x-1/2 -translate-y-[85%] rounded-t-full border-[1.5px] border-b-0 border-wardrobe-rail"
      />

      <span
        className={`absolute inset-0 transition-[filter] duration-200 ${
          active
            ? "drop-shadow-[0_16px_22px_rgba(27,26,23,0.4)]"
            : "drop-shadow-[0_10px_14px_rgba(27,26,23,0.28)]"
        }`}
        style={{
          // A garment bag's shape: tapered over the shoulders, chamfered at the
          // hem. Cheaper and crisper than an SVG mask, and it clips the photo
          // inside to the bag rather than the other way round.
          clipPath: BAG_SHAPE,
        }}
      >
        <span className="absolute inset-0 block overflow-hidden bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            // object-contain, always: this is the whole point of the bag. The
            // photo is fitted, never cropped, so nothing is cut off when it
            // clears.
            //
            // Deeper padding at the top so the photo starts below the shoulder
            // curve — otherwise the clip takes its top corners. Percentages all
            // resolve against the bag's width, which is why the top figure looks
            // out of proportion to the others.
            className={`h-full w-full object-contain px-[6%] pb-[6%] pt-[20%] transition-[filter,transform] duration-300 ${
              active ? "scale-100 blur-0" : "scale-[1.03] blur-[2px]"
            }`}
          />

          {/* The bag itself. backdrop-blur frosts whatever is behind it, so the
              garment reads as a shape seen through plastic rather than as a
              blurred picture; the tint alone is the fallback where it isn't
              supported. Kept light on purpose — heavier and every piece reads
              as a blank white sheet, which is the look this replaced. */}
          <span
            className={`absolute inset-0 block backdrop-blur-[3px] transition-opacity duration-300 ${
              active ? "opacity-0" : "opacity-100"
            }`}
            style={{
              background:
                "linear-gradient(105deg, rgba(255,255,255,0.52) 0%, rgba(236,233,227,0.3) 40%, rgba(255,255,255,0.44) 64%, rgba(226,222,214,0.5) 100%)",
            }}
          />

          {/* The zip. */}
          <span
            aria-hidden
            className={`absolute inset-y-[4%] left-1/2 w-px -translate-x-1/2 bg-room-ink/15 transition-opacity duration-300 ${
              active ? "opacity-0" : "opacity-100"
            }`}
          />
        </span>
      </span>

      {/* The seam. Drawn as a stroke on the same polygon rather than a border,
          because a clip-path cuts a border off — and without an outline eight
          pale bags side by side merge into one white band.
          `non-scaling-stroke` keeps it hairline under the non-uniform scale. */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={`pointer-events-none absolute inset-0 h-full w-full transition-colors duration-200 ${
          active ? "text-room-ink/45" : "text-room-ink/25"
        }`}
      >
        <polygon
          points={BAG_POINTS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </button>
  );
}
