"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { stops, heroLine, isTodo } from "@/lib/copy";
import { MOTION, isDesktop, prefersReducedMotion } from "@/lib/motion";

const FRAME_COUNT = 197;
const framePath = (i: number) => `/frames/f_${String(i + 1).padStart(4, "0")}.jpg`;

/**
 * The whole site's motion lives inside one rounded rectangle, inset from the
 * page edges, pinned while scroll drives it: the hero line dissolves, the
 * corridor walks, the camera rests twice while pieces hang from the rails and
 * the writing appears between them, and then the page releases into the
 * section below. Scrolling back reverses all of it exactly.
 */

// Segments of pinned progress. Frames advance only in "walk" spans; during a
// stop the frame holds still — the camera is resting.
//
// Frames 0–70 are the doors parting and the camera pushing through; 71–196
// continue down the corridor. They are one sequence, cut from two clips that
// share an end and start frame, so the opening flows into the walk without a
// seam.
const DOORS_END = 70;
const WALKS: Array<{ from: number; to: number; f0: number; f1: number }> = [
  { from: 0.04, to: 0.24, f0: 0, f1: DOORS_END },
  { from: 0.24, to: 0.4, f0: DOORS_END, f1: 118 },
  { from: 0.56, to: 0.72, f0: 118, f1: 160 },
  { from: 0.88, to: 1.0, f0: 160, f1: FRAME_COUNT - 1 },
];
const STOP_SPANS: Array<{ enter: number; exit: number }> = [
  { enter: 0.4, exit: 0.56 },
  { enter: 0.72, exit: 0.88 },
];

/** How much scroll before a stop the pieces start coming into view. */
const PIECE_LEAD = 0.13;

export default function CorridorWalk() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  /**
   * True when the walk isn't going to run and the page has to carry the writing
   * on its own.
   *
   * The two stops only ever existed twice: as an overlay the scrubber fades in,
   * and as a plain flow below it marked `lg:hidden`. That pairing assumed the
   * only reason not to animate was a narrow screen — so a desktop visitor with
   * "reduce motion" turned on got neither. The overlay sat at opacity 0 waiting
   * for a timeline that returns on the line below, and the flow was hidden by a
   * breakpoint that had nothing to do with it. What was left was the hero line,
   * a still of the shut doors, and the footer: both headings and both
   * paragraphs — the entire description of what this thing does — gone.
   *
   * Reduced motion is a common setting, not an edge case, so this is decided at
   * runtime rather than by a media query.
   */
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    if (!isDesktop() || prefersReducedMotion()) {
      setStaticMode(true);
      return;
    }

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
      // naturalWidth as well as complete: a request that failed still reports
      // complete, and handing drawImage a broken image throws.
      if (!img?.complete || img.naturalWidth === 0 || index === current) return;
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

    /*
     * Reveal the canvas when the frames have finished arriving — not when all
     * of them have arrived successfully.
     *
     * This used to be `loaded === FRAME_COUNT` with no error handler at all,
     * which meant a single dropped request out of 197 left `ready` false
     * forever: the poster never faded, the canvas stayed underneath it, and the
     * whole corridor silently degraded to a still of the shut doors. 197
     * requests and 7MB over a real network drops one eventually, so this was a
     * matter of time rather than bad luck, and it failed in the one way nobody
     * reports usefully — the page looked deliberate.
     *
     * A missing frame in the middle is survivable on its own: `draw` skips any
     * image that isn't there, so the walk holds the previous frame for a beat
     * instead of stuttering. Only the total absence of frames is fatal, and
     * that's what the `loaded` check below is for.
     */
    let settled = 0;
    const settle = () => {
      if (cancelled) return;
      settled += 1;
      if (settled === FRAME_COUNT && loaded > 0) setReady(true);
    };

    // And a floor under the whole thing: a connection that stalls rather than
    // failing never fires either handler, so nothing above would ever run.
    // Once most of the walk is in, start it regardless of the stragglers.
    const timeout = window.setTimeout(() => {
      if (!cancelled && loaded > FRAME_COUNT / 2) setReady(true);
    }, 10000);

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = framePath(i);
      img.onload = () => {
        if (cancelled) return;
        loaded += 1;
        if (i === 0) draw(0);
        settle();
      };
      img.onerror = settle;
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

    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    /** Ramp up over [a,b], hold, ramp down over [c,d]. */
    const window4 = (p: number, a: number, b: number, c: number, d: number) => {
      if (p <= a || p >= d) return 0;
      if (p < b) return clamp01((p - a) / (b - a));
      if (p <= c) return 1;
      return clamp01(1 - (p - c) / (d - c));
    };

    /**
     * Pieces are already on the rails and approaching before the camera stops
     * — they read as hanging further down the corridor and coming toward you,
     * so the walk never looks empty. Text waits for the rest.
     */
    const setStop = (el: HTMLElement, pieceT: number, textT: number) => {
      const pieces = el.querySelectorAll<HTMLElement>("[data-piece]");
      const text = el.querySelector<HTMLElement>("[data-stop-text]");
      const ease = gsap.parseEase("power2.out")(clamp01(pieceT));
      pieces.forEach((piece, i) => {
        const dir = i === 0 ? -1 : 1;
        gsap.set(piece, {
          opacity: Math.min(1, ease * 1.25),
          // Far away they sit small and nearer the vanishing point; as the
          // camera closes they grow and swing out to their resting place.
          scale: 0.72 + ease * 0.28,
          x: -dir * (1 - ease) * 84,
          y: (1 - ease) * 26,
          rotation: dir * (1 - ease) * 2.5,
        });
      });
      if (text) {
        const te = gsap.parseEase("power2.out")(clamp01(textT));
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

        // The hero line holds on the shut doors, then dissolves as they part.
        if (introRef.current) {
          const t = Math.min(1, Math.max(0, (p - 0.02) / 0.07));
          gsap.set(introRef.current, { opacity: 1 - t, y: t * -24 });
        }

        STOP_SPANS.forEach((span, i) => {
          const el = stopEls[i];
          if (!el) return;
          const len = span.exit - span.enter;
          // Pieces lead the stop by PIECE_LEAD of scroll and linger past it,
          // so they arrive with the camera and leave with the walk.
          // They must be fully gone by the time the next pair starts drifting
          // in, or the two sets ghost over each other mid-walk.
          const pieceT = window4(p, span.enter - PIECE_LEAD, span.enter + len * 0.06, span.exit - len * 0.35, span.exit);
          // Text only once the camera is actually at rest.
          const textT = window4(p, span.enter + len * 0.08, span.enter + len * 0.3, span.exit - len * 0.28, span.exit - len * 0.05);
          setStop(el, pieceT, textT);
        });
      },
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      st.kill();
    };
  }, []);

  return (
    <section ref={sectionRef} aria-label="The corridor" className="relative w-full lg:h-screen">
      {/* The frame: a rounded rectangle inset from the page, everything
          animated lives inside it. */}
      {/* Insets clear the shared rail: the left edge starts past it on
          desktop, and on phones the frame sits below the top bar. */}
      <div className="lg:absolute lg:bottom-[6vh] lg:left-[calc(13rem+2.5vw)] lg:right-[2.5vw] lg:top-[6vh] max-lg:mx-4 max-lg:mb-4 max-lg:mt-20">
        <div className="relative h-full w-full overflow-hidden rounded-3xl shadow-[0_30px_60px_-30px_rgba(27,26,23,0.45)] max-lg:aspect-video">
          {/* Poster for mobile, reduced motion, and the moment before preload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={framePath(0)}
            alt=""
            aria-hidden
            className={`absolute inset-0 h-full w-full object-cover ${ready ? "lg:opacity-0" : ""}`}
          />
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 hidden h-full w-full lg:block" />

          {/* The dust breathes inside the frame only. */}
          <video
            muted
            loop
            autoPlay
            playsInline
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-[0.12] mix-blend-screen lg:block"
          >
            <source src="/dust.webm" type="video/webm" />
            <source src="/dust.mp4" type="video/mp4" />
          </video>

          {/* The hero line, on the first frame of the walk. */}
          <div
            ref={introRef}
            className={`absolute inset-0 hidden items-center justify-center ${staticMode ? "" : "lg:flex"}`}
          >
            <h1
              className={`px-10 text-center font-serif text-room-ink [font-size:clamp(2.4rem,5vw,4.8rem)] leading-[1.08] ${
                isTodo(heroLine) ? "opacity-40" : ""
              }`}
            >
              {heroLine}
            </h1>
          </div>

          {/* Desktop: the stops, driven by the pinned timeline. */}
          <div ref={overlayRef} aria-hidden className={`absolute inset-0 hidden ${staticMode ? "" : "lg:block"}`}>
            {stops.map((stop, i) => (
              <div key={i} data-stop className="absolute inset-0">
                <div className="absolute left-[9%] top-[10%] w-[15%]" data-piece style={{ opacity: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stop.pieces[0]} alt="" draggable={false} className="w-full select-none drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)]" />
                </div>
                <div className="absolute right-[9%] top-[10%] w-[15%]" data-piece style={{ opacity: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stop.pieces[1]} alt="" draggable={false} className="w-full select-none drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)]" />
                </div>
                <div
                  data-stop-text
                  className="absolute left-1/2 top-[32%] flex w-[min(46%,560px)] -translate-x-1/2 flex-col items-center gap-4 text-center"
                  style={{ opacity: 0 }}
                >
                  <span className="text-[11px] uppercase tracking-[0.22em] text-room-faint">{stop.label}</span>
                  <h2
                    className={`font-serif text-room-ink [font-size:clamp(1.6rem,2.6vw,2.5rem)] leading-tight ${
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
        </div>
      </div>

      {/* Mobile and reduced motion: the hero line and stops as a plain flow. */}
      <div className={staticMode ? "relative" : "relative lg:hidden"}>
        <h1 className={`mx-auto max-w-xl px-6 pt-10 text-center font-serif text-4xl leading-tight text-room-ink ${isTodo(heroLine) ? "opacity-40" : ""}`}>
          {heroLine}
        </h1>
        {stops.map((stop, i) => (
          <section key={i} className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-16 text-center">
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
            <h2 className={`font-serif text-3xl leading-tight text-room-ink ${isTodo(stop.heading) ? "opacity-40" : ""}`}>
              {stop.heading}
            </h2>
            <p className={`text-[15px] leading-relaxed text-room-muted ${isTodo(stop.body) ? "opacity-40" : ""}`}>{stop.body}</p>
          </section>
        ))}
      </div>
    </section>
  );
}
