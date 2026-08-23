"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { stops, heroLine, isTodo } from "@/lib/copy";
import { MOTION, isDesktop, prefersReducedMotion } from "@/lib/motion";

/**
 * The canonical walk. Every frame index in this file is a position in these
 * 197, whichever set is actually on screen.
 */
const FRAME_COUNT = 197;
const framePath = (i: number) => `/frames/f_${String(i + 1).padStart(4, "0")}.jpg`;

/**
 * The same walk, for a phone: 66 frames at 760px instead of 197 at 1400px,
 * 0.85MB instead of 7.2MB. Built by scripts/build-phone-frames.mjs, which is
 * where the sampling and the quality live.
 *
 * The payload is the entire reason the corridor used to stop at lg. A third of
 * the frames is a real reduction in smoothness, but the camera moves slowly
 * enough that it reads as a slow pan rather than a stutter — and the phone's
 * pin is shorter to match, so the frames are spread over less scrolling than
 * the desktop's.
 */
const PHONE_FRAME_COUNT = 66;
const phoneFramePath = (i: number) => `/frames-sm/f_${String(i + 1).padStart(4, "0")}.jpg`;

/**
 * The phone's copy of a garment cut-out. Same technique and same script as the
 * frames: the originals are drawn about 110px wide on a phone and cost 813KB
 * across the four to do it.
 */
const smallPiece = (src: string) => `/garments-sm${src}`;

/** Which of a set's frames stands in for a position on the canonical walk. */
function scaleIndex(canonical: number, count: number): number {
  if (count === FRAME_COUNT) return canonical;
  return Math.round((canonical * (count - 1)) / (FRAME_COUNT - 1));
}

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
  /** Desktop, decided once on mount — gates the decoration a phone shouldn't pay for. */
  const [wide, setWide] = useState(false);

  useEffect(() => {
    // Only a stated preference for less movement stops the walk now. Width
    // decides which set of frames to fetch and how far to pin, not whether the
    // corridor happens at all.
    if (prefersReducedMotion()) {
      setStaticMode(true);
      return;
    }

    const phone = !isDesktop();
    setWide(!phone);
    const count = phone ? PHONE_FRAME_COUNT : FRAME_COUNT;
    const pathFor = phone ? phoneFramePath : framePath;

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
      if (settled === count && loaded > 0) setReady(true);
    };

    // And a floor under the whole thing: a connection that stalls rather than
    // failing never fires either handler, so nothing above would ever run.
    // Once most of the walk is in, start it regardless of the stragglers.
    const timeout = window.setTimeout(() => {
      if (!cancelled && loaded > count / 2) setReady(true);
    }, 10000);

    for (let i = 0; i < count; i++) {
      const img = new Image();
      img.src = pathFor(i);
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
      end: phone ? "+=320%" : "+=520%",
      pin: true,
      scrub: MOTION.cameraScrub,
      onUpdate: (self) => {
        const p = self.progress;
        draw(scaleIndex(frameAt(p), count));

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
    <section
      ref={sectionRef}
      aria-label="The corridor"
      data-corridor
      /* svh, not vh: iOS measures vh against the viewport with the URL bar
         hidden, so a 100vh pinned section is taller than the screen actually is
         and the walk starts partly under the fold. */
      className={`relative w-full ${staticMode ? "" : "h-[100svh]"}`}
    >
      {/* The frame: a rounded rectangle inset from the page, everything
          animated lives inside it. When the walk runs it fills the screen;
          when it doesn't it's a still at the top of a plain document. */}
      <div
        data-frame
        className={
          staticMode
            ? "mx-4 mb-4 mt-20"
            : "absolute inset-x-3 bottom-[5vh] top-[5vh] lg:inset-x-[2.5vw] lg:bottom-[6vh] lg:top-[6vh]"
        }
      >
        <div
          data-frame-inner
          className={`bleed relative h-full w-full overflow-hidden ${
            staticMode ? "aspect-video" : ""
          }`}
        >
          {/* The still under everything: what a phone sees before the frames
              land, and all anyone sees in reduced motion. A phone never fetches
              the 1400px one - it would cost more than three frames of the walk
              it's standing in for. */}
          <picture>
            <source media="(min-width: 1024px)" srcSet={framePath(0)} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={phoneFramePath(0)}
              alt=""
              aria-hidden
              className={`absolute inset-0 h-full w-full object-cover ${
                ready && !staticMode ? "opacity-0" : ""
              }`}
            />
          </picture>
          <canvas
            ref={canvasRef}
            aria-hidden
            className={`absolute inset-0 h-full w-full ${staticMode ? "hidden" : ""}`}
          />

          {/* The dust breathes inside the frame, on a desktop only. `hidden` was
              not enough on its own: an autoplaying video is fetched whether or
              not it is on screen, so a phone paid 240KB for a film it never
              got shown. Not rendering it at all is the only thing that stops
              the download. */}
          {wide && (
            <video
              muted
              loop
              autoPlay
              playsInline
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.12] mix-blend-screen"
            >
              <source src="/dust.webm" type="video/webm" />
              <source src="/dust.mp4" type="video/mp4" />
            </video>
          )}

          {/* The hero line, on the first frame of the walk. */}
          <div
            ref={introRef}
            data-intro
            className={`absolute inset-0 items-center justify-center ${staticMode ? "hidden" : "flex"}`}
          >
            <h1
              className={`px-10 text-center display text-footage-ink [font-size:clamp(2.4rem,5vw,4.8rem)] leading-[1.08] ${
                isTodo(heroLine) ? "opacity-40" : ""
              }`}
            >
              {heroLine}
            </h1>
          </div>

          {/* Desktop: the stops, driven by the pinned timeline. */}
          <div ref={overlayRef} aria-hidden data-overlay className={`absolute inset-0 ${staticMode ? "hidden" : "block"}`}>
            {stops.map((stop, i) => (
              <div key={i} data-stop className="absolute inset-0">
                <div className="absolute left-[3%] top-[7%] w-[27%] lg:left-[9%] lg:top-[10%] lg:w-[15%]" data-piece style={{ opacity: 0 }}>
                  <picture>
                    <source media="(min-width: 1024px)" srcSet={stop.pieces[0]} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={smallPiece(stop.pieces[0])}
                      alt=""
                      draggable={false}
                      className="w-full select-none drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)]"
                    />
                  </picture>
                </div>
                <div className="absolute right-[3%] top-[7%] w-[27%] lg:right-[9%] lg:top-[10%] lg:w-[15%]" data-piece style={{ opacity: 0 }}>
                  <picture>
                    <source media="(min-width: 1024px)" srcSet={stop.pieces[1]} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={smallPiece(stop.pieces[1])}
                      alt=""
                      draggable={false}
                      className="w-full select-none drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)]"
                    />
                  </picture>
                </div>
                <div
                  data-stop-text
                  className="absolute left-1/2 top-[34%] flex w-[86%] -translate-x-1/2 flex-col items-center gap-3 text-center lg:top-[32%] lg:w-[min(46%,560px)] lg:gap-4"
                  style={{ opacity: 0 }}
                >
                  <span className="text-[11px] uppercase tracking-[0.22em] text-footage-muted">{stop.label}</span>
                  <h2
                    className={`display text-footage-ink [font-size:clamp(1.5rem,6.5vw,2.5rem)] leading-tight lg:[font-size:clamp(1.6rem,2.6vw,2.5rem)] ${
                      isTodo(stop.heading) ? "opacity-40" : ""
                    }`}
                  >
                    {stop.heading}
                  </h2>
                  <p className={`max-w-[46ch] text-[13.5px] leading-relaxed text-footage-muted lg:text-[15px] ${isTodo(stop.body) ? "opacity-40" : ""}`}>
                    {stop.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/*
        Without JavaScript there is no walk, and the markup above defaults to
        the walk because that is what almost everyone gets - so the fallback has
        to be reasserted here rather than chosen at render time. This puts the
        page back to a still and a document: the same thing reduced motion sees.

        A <noscript> block rather than a default-static render because the
        alternative is a visible jump from document to pinned corridor on every
        load, for every visitor, to serve the ones who have JS switched off.
      */}
      <noscript>
        <style>{`
          [data-corridor] { height: auto !important; }
          [data-frame] { position: static !important; inset: auto !important; margin: 5rem 1rem 1rem !important; }
          [data-frame-inner] { aspect-ratio: 16 / 9 !important; }
          [data-intro], [data-overlay] { display: none !important; }
          [data-flow] { display: block !important; }
        `}</style>
      </noscript>

      {/* Reduced motion, no JavaScript: the hero line and stops as a plain flow. */}
      <div data-flow className={staticMode ? "relative" : "hidden"}>
        <h1 className={`mx-auto max-w-xl px-6 pt-10 text-center display text-4xl leading-tight text-footage-ink ${isTodo(heroLine) ? "opacity-40" : ""}`}>
          {heroLine}
        </h1>
        {stops.map((stop, i) => (
          <section key={i} className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-16 text-center">
            <div className="flex items-start justify-center gap-6">
              {/* Sized the same way as the overlay's copies, and for a sharper
                  reason than bandwidth alone: display:none does not stop
                  Chrome fetching an image, so while this flow is hidden behind
                  the running walk it was still pulling all four originals - 
                  a phone downloaded 813KB of cut-outs it would never show on
                  top of the 120KB of cut-outs it did. */}
              {stop.pieces.map((src, j) => (
                <picture key={j}>
                  <source media="(min-width: 1024px)" srcSet={src} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={smallPiece(src)}
                    alt={stop.pieceNames[j]}
                    className="w-[34vw] max-w-[180px] drop-shadow-[0_14px_18px_rgba(27,26,23,0.30)]"
                  />
                </picture>
              ))}
            </div>
            <span className="text-[11px] uppercase tracking-[0.22em] text-footage-muted">{stop.label}</span>
            <h2 className={`display text-3xl leading-tight text-footage-ink ${isTodo(stop.heading) ? "opacity-40" : ""}`}>
              {stop.heading}
            </h2>
            <p className={`text-[15px] leading-relaxed text-footage-muted ${isTodo(stop.body) ? "opacity-40" : ""}`}>{stop.body}</p>
          </section>
        ))}
      </div>
    </section>
  );
}
