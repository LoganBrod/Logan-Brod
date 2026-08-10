"use client";

import { forwardRef } from "react";
import type { Bay } from "@/lib/copy";
import { isTodo } from "@/lib/copy";

/**
 * The bag itself: clip-path silhouette, frost layer, outline, hook, and the
 * writing inside. A clip-path cuts borders off, so the outline is an SVG
 * polygon on the same points — without it, pale bags side by side merge into
 * one white band.
 */
const OUTLINE_POINTS =
  "46,0 54,0 66,2 78,6 89,12 96,17 100,22 100,95 96,100 4,100 0,95 0,22 4,17 11,12 22,6 34,2";

type Props = {
  bay: Bay;
  index: number;
};

const GarmentBag = forwardRef<HTMLDivElement, Props>(function GarmentBag({ bay, index }, ref) {
  const todo = isTodo(bay.heading);

  return (
    <div
      ref={ref}
      data-bag
      data-cursor-target="bag"
      className="relative mx-auto w-[min(78vw,540px)] shadow-hang"
      style={{ transformOrigin: "top center", aspectRatio: "540 / 640" }}
    >
      {/* The hook sits over the rail, not below it. */}
      <div aria-hidden className="rail-hook absolute left-1/2 top-0 -translate-x-1/2" />

      <div className="bag-shape bag-face absolute inset-0" />

      {/* A faint vertical zip line down the centre. */}
      <div aria-hidden className="absolute left-1/2 top-[6%] h-[88%] w-px -translate-x-1/2 bg-room-ink/10" />

      {/* The frost that clears as the bay presents. */}
      <div data-frost className="bag-shape bag-frost absolute inset-0" />

      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <polygon
          points={OUTLINE_POINTS}
          fill="none"
          stroke="#AFABA3"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The writing the bag turns out to hold. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-[12%] text-center">
        <h2
          data-reveal
          data-cursor-target="text"
          className={`font-serif text-room-ink [font-size:clamp(2rem,4vw,3.5rem)] leading-tight ${todo ? "opacity-40" : ""}`}
        >
          {bay.heading}
        </h2>
        <p
          data-reveal
          data-cursor-target="text"
          className={`max-w-[65ch] text-[15px] leading-relaxed text-room-muted ${isTodo(bay.body) ? "opacity-40" : ""}`}
        >
          {bay.body}
        </p>
        <span
          data-reveal
          className={`text-[11px] uppercase tracking-[0.22em] text-room-faint ${isTodo(bay.label) ? "opacity-40" : ""}`}
        >
          {bay.label}
        </span>
      </div>

      <span className="sr-only">Bay {index + 1}</span>
    </div>
  );
});

export default GarmentBag;
