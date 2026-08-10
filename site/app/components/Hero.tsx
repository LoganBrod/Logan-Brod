"use client";

import { useEffect, useRef, useState } from "react";
import { heroLine, isTodo } from "@/lib/copy";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Full viewport: the closed wardrobe opening, played once on entry — never
 * scrubbed. One line of Playfair and a hairline scroll cue that fades after 4s
 * or on first scroll. Nothing else. The restraint is the pitch.
 */
export default function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cueGone, setCueGone] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    videoRef.current?.play().catch(() => {
      // Autoplay refused — the poster carries the frame.
    });

    const timer = window.setTimeout(() => setCueGone(true), 4000);
    const onScroll = () => setCueGone(true);
    window.addEventListener("scroll", onScroll, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <section className="relative flex h-screen w-full items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        poster="/closet-building.jpg"
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/closet-building.webm" type="video/webm" />
        <source src="/closet-building.mp4" type="video/mp4" />
      </video>

      <h1
        data-cursor-target="text"
        className={`relative z-10 px-6 text-center font-serif text-room-ink [font-size:clamp(3rem,7vw,7rem)] leading-[1.05] ${
          isTodo(heroLine) ? "opacity-40" : ""
        }`}
      >
        {heroLine}
      </h1>

      <div
        aria-hidden
        className={`absolute bottom-10 left-1/2 h-14 w-px -translate-x-1/2 bg-room-ink/30 transition-opacity duration-700 ${
          cueGone ? "opacity-0" : "opacity-100"
        }`}
      />
    </section>
  );
}
