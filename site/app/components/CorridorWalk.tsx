"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { stops, isTodo } from "@/lib/copy";
import { MOTION, isDesktop, prefersReducedMotion } from "@/lib/motion";

const FRAME_COUNT = 160;
const framePath = (i: number) => `/frames/f_${String(i + 1).padStart(4, "0")}.jpg`;

/**
 * The whole walk as one pinned timeline. Scroll drives the corridor frame
 * sequence; twice along the way the camera comes to rest, pieces swing down
 * from the corridor rails on both sides, and the writing appears between
 * them. Then the pieces lift away, the walk resumes, and the section releases
 * into the page below — no cut, no scene change.
 *
 * The frame mapping and every stop live on a single scrubbed timeline, so
 * scrolling back up reverses all of it exactly.
 */

// Segments of pinned progress. Frames advance only in "walk" spans; during a
// stop the frame holds still — the camera is resting.
const WALKS: Array<{ from: number; to: number; f0: number; f1: number }> = [
  { from: 0.0, to: 0.24, f0: 0, f1: 62 },
  { from: 0.42, to: 0.62, f0: 62, f1: 120 },
  { from: 0.8, to: 1.0, f0: 120, f1: 159 },
];
const STOP_SPANS: Array<{ enter: number; exit: number }> = [
  { enter: 0.24, exit: 0.42 },
  { enter: 0.62, exit: 0.8 },
];

export default function CorridorWalk() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isDesktop() || prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!section || !canvas || !overlay) return;

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
      const scale = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale);
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

    const frameAt = (p: number): number => {
      for (const w of WALKS) {
        if (p <= w.to) {
          if (p <= w.from) return w.f0;
          return Math.round(w.f0 + ((p - w.from) / (w.to - w.from)) * (w.f1 - w.f0));
        }
      }
      return FRAME_COUNT - 1;
    };

    const stopEls = Array.from(overlay.querySelectorAll<HTMLElement>("[data-stop]"));

    // Everything below is driven by one number: pinned progress.
    const setStop = (el: HTMLElement, t: number) => {
      // t: 0 = hidden, 1 = fully presented. Pieces drop from above the rail
      // line; text follows. Nothing overshoots.
      const pieces = el.querySelectorAll<HTMLElement>("[data-piece]");
      const text = el.querySelector<HTMLElement>("[data-stop-text]");
      const ease = gsap.parseEase("power2.out")(Math.min(1, Math.max(0, t)));
      pieces.forEach((piece, i) => {
        const dir = i === 0 ? -1 : 1;
        gsap.set(piece, {
          opacity: ease,
          y: (1 - ease) * -46,
          x: (1 - ease) * dir * 24,
          rotation: dir * (1 - ease) * 2,
        });
      });
      if (text) {
        const tt = Math.min(1, Math.max(0, (t - 0.35) / 0.65));
        const te = gsap.parseEase("power2.out")(tt);
        gsap.set(text, { opacity: te, y: (1 - te) * 20 });
      }
    };

    const st = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=520%",
      pin: true,
      scrub: MOTION.cameraScrub,
      onUpdate: (self) => {
        const p = self.progress;
        draw(frameAt(p));

        STOP_SPANS.forEach((span, i) => {
          const el = stopEls[i];
          if (!el) return;
          const mid = 0.3; // fraction of the span spent arriving/leaving
          const inEnd = span.enter + (span.exit - span.enter) * mid;
          const outStart = span.exit - (span.exit - span.enter) * mid;
          let t = 0;
          if (p >= span.enter && p < inEnd) t = (p - span.enter) / (inEnd - span.enter);
          else if (p >= inEnd && p <= outStart) t = 1;
          else if (p > outStart && p <= span.exit) t = 1 - (p - outStart) / (span.exit - outStart);
          setStop(el, t);
        });
      },
    });

    return () => {
      cancelled = true;
      st.kill();
    };
  }, []);

  return (
    <section ref={sectionRef} aria-label="The corridor" className="relative w-full overflow-hidden lg:h-screen">
      {/* Poster for mobile, reduced motion, and the moment before preload. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={framePath(0)}
        alt=""
        aria-hidden
        className={`w-full object-cover max-lg:h-[52vh] lg:absolute lg:inset-0 lg:h-full ${ready ? "lg:opacity-0" : ""}`}
      />
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 hidden h-full w-full lg:block" />

      {/* Desktop: the stops, driven by the pinned timeline above. */}
      <div ref={overlayRef} aria-hidden className="absolute inset-0 hidden lg:block">
        {stops.map((stop, i) => (
          <div key={i} data-stop className="absolute inset-0">
            <div className="absolute left-[10%] top-[12%] w-[17vw]" data-piece style={{ opacity: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stop.pieces[0]} alt="" draggable={false} className="w-full select-none drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)]" />
            </div>
            <div className="absolute right-[10%] top-[12%] w-[17vw]" data-piece style={{ opacity: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stop.pieces[1]} alt="" draggable={false} className="w-full select-none drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)]" />
            </div>
            <div
              data-stop-text
              className="absolute left-1/2 top-[34%] flex w-[min(44vw,560px)] -translate-x-1/2 flex-col items-center gap-4 text-center"
              style={{ opacity: 0 }}
            >
              <span className="text-[11px] uppercase tracking-[0.22em] text-room-faint">{stop.label}</span>
              <h2
                className={`font-serif text-room-ink [font-size:clamp(1.8rem,3vw,2.8rem)] leading-tight ${
                  isTodo(stop.heading) ? "opacity-40" : ""
                }`}
              >
                {stop.heading}
              </h2>
              <p className={`max-w-[46ch] text-[15px] leading-relaxed text-room-muted ${isTodo(stop.body) ? "opacity-40" : ""}`}>
                {stop.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile and reduced motion: the stops as a plain readable flow. */}
      <div className="relative lg:hidden">
        {stops.map((stop, i) => (
          <section key={i} className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-20 text-center">
            <div className="flex items-start justify-center gap-6">
              {stop.pieces.map((src, j) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={j}
                  src={src}
                  alt={stop.pieceNames[j]}
                  className="w-[34vw] max-w-[180px] drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)]"
                />
              ))}
            </div>
            <span className="text-[11px] uppercase tracking-[0.22em] text-room-faint">{stop.label}</span>
            <h2 className={`font-serif text-room-ink text-3xl leading-tight ${isTodo(stop.heading) ? "opacity-40" : ""}`}>
              {stop.heading}
            </h2>
            <p className={`text-[15px] leading-relaxed text-room-muted ${isTodo(stop.body) ? "opacity-40" : ""}`}>{stop.body}</p>
          </section>
        ))}
      </div>
    </section>
  );
}
