"use client";

import { useEffect, useRef } from "react";
import { closing, isTodo, legal } from "@/lib/copy";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The way out: the camera arrives at the end wall and comes to rest. This is
 * the one clip where deceleration is correct. One heading, one sentence, one
 * contact action, one quiet line of legal — and nothing further to scroll to.
 */
export default function ClosingBay() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const video = videoRef.current;
    if (!video) return;

    // Plays once when it enters view, then holds on its final frame — which is
    // also the poster, so the still matches where the clip ends.
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
    <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
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

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6 px-6 text-center">
        <h2
          data-cursor-target="text"
          className={`font-serif text-room-ink [font-size:clamp(2rem,4vw,3.5rem)] leading-tight ${
            isTodo(closing.heading) ? "opacity-40" : ""
          }`}
        >
          {closing.heading}
        </h2>
        <p
          data-cursor-target="text"
          className={`max-w-[65ch] text-[15px] leading-relaxed text-room-muted ${
            isTodo(closing.sentence) ? "opacity-40" : ""
          }`}
        >
          {closing.sentence}
        </p>
        <a
          href={closing.actionHref}
          data-cursor-target="bag"
          className="mt-2 border border-accent px-8 py-3 text-[13px] uppercase tracking-[0.22em] text-accent transition-colors duration-200 ease-out hover:bg-accent hover:text-room-panel"
        >
          {closing.actionLabel}
        </a>
      </div>

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-room-faint">{legal}</p>
    </section>
  );
}
