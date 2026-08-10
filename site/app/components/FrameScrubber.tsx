"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MOTION, isDesktop, prefersReducedMotion } from "@/lib/motion";

const FRAME_COUNT = 160;
const framePath = (i: number) => `/frames/f_${String(i + 1).padStart(4, "0")}.jpg`;

/**
 * The corridor walk: a pinned section whose scroll progress maps linearly onto
 * a preloaded JPEG sequence painted to a canvas. Never a <video> — setting
 * currentTime from scroll stutters on iOS and seeks unpredictably everywhere.
 *
 * Until preloading finishes the first frame shows as a static image; below lg
 * and under prefers-reduced-motion the sequence is skipped entirely and the
 * poster stands in.
 */
export default function FrameScrubber() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isDesktop() || prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const images: HTMLImageElement[] = [];
    let loaded = 0;
    let current = -1;

    const draw = (index: number) => {
      const img = images[index];
      if (!img?.complete || index === current) return;
      current = index;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // Cover-fit: the sequence is 1600×892; the viewport rarely matches.
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = framePath(i);
      img.onload = () => {
        if (cancelled) return;
        loaded += 1;
        if (i === 0) draw(0);
        if (loaded === FRAME_COUNT) setReady(true);
      };
      images.push(img);
    }

    const state = { frame: 0 };
    const st = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=250%",
      pin: true,
      scrub: MOTION.cameraScrub,
      onUpdate: (self) => {
        state.frame = Math.round(self.progress * (FRAME_COUNT - 1));
        draw(state.frame);
      },
    });

    const onResize = () => {
      current = -1;
      draw(state.frame);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      st.kill();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section ref={sectionRef} aria-label="The corridor" className="relative h-screen w-full overflow-hidden">
      {/* Poster for mobile, reduced motion, and the moment before preload. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={framePath(0)}
        alt=""
        aria-hidden
        className={`absolute inset-0 h-full w-full object-cover ${ready ? "lg:opacity-0" : ""}`}
      />
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 hidden h-full w-full lg:block" />
    </section>
  );
}
