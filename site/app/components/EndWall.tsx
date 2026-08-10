"use client";

import { useEffect, useRef, useState } from "react";
import { garments, isTodo } from "@/lib/copy";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The arrival. The corridor walk hands off to this section: the end-wall clip
 * settles to rest, and the clothes hanging on its rail carry the writing.
 * Hovering a garment lifts it and presents its card; focus and tap do the
 * same, because a pointer is not a requirement for reading.
 */
export default function EndWall() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const video = videoRef.current;
    if (!video) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <section aria-label="What hangs in the closet" className="relative min-h-screen w-full overflow-hidden">
      <video
        ref={videoRef}
        muted
        playsInline
        preload="metadata"
        poster="/end-wall.jpg"
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/end-wall.webm" type="video/webm" />
        <source src="/end-wall.mp4" type="video/mp4" />
      </video>

      {/* The garments hang from the rail in the footage — positioned against
          the rail line of the final frame. */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-start justify-center gap-[8vw] px-6 pt-[16vh] max-lg:flex-col max-lg:items-center max-lg:gap-16 max-lg:pt-24">
        {garments.map((garment, i) => {
          const open = active === i;
          return (
            <div key={i} className="flex w-[min(72vw,320px)] flex-col items-center">
              <button
                type="button"
                data-cursor-target="bag"
                aria-expanded={open}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                onClick={() => setActive((a) => (a === i ? null : i))}
                className={`group relative w-full transition-transform duration-500 ease-out ${
                  open ? "-translate-y-2" : "translate-y-0"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={garment.image}
                  alt={garment.name}
                  draggable={false}
                  className={`w-full select-none drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)] transition-[filter] duration-500 ${
                    open ? "" : "brightness-[0.99]"
                  } ${i % 2 ? "rotate-[0.7deg]" : "-rotate-[0.7deg]"} animate-sway`}
                  style={{ animationDelay: `${i * 1.4}s` }}
                />
              </button>

              <div
                aria-hidden={!open}
                className={`mt-6 flex flex-col items-center gap-3 text-center transition-all duration-500 ease-out ${
                  open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
                }`}
              >
                <span className="text-[11px] uppercase tracking-[0.22em] text-room-faint">{garment.label}</span>
                <h2
                  className={`font-serif text-room-ink [font-size:clamp(1.5rem,2.4vw,2.2rem)] leading-tight ${
                    isTodo(garment.heading) ? "opacity-40" : ""
                  }`}
                >
                  {garment.heading}
                </h2>
                <p
                  className={`max-w-[42ch] text-[15px] leading-relaxed text-room-muted ${
                    isTodo(garment.body) ? "opacity-40" : ""
                  }`}
                >
                  {garment.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
