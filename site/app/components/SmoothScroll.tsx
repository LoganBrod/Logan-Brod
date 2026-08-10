"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Wires Lenis into GSAP's ticker so ScrollTrigger reads Lenis's scroll value
 * rather than the native one. Getting this wrong produces drift between the
 * smooth scroll and the pinned sections, and is the most common way a site like
 * this breaks.
 *
 * Lenis smooths; it never takes control away. No snapping, no hijacked speed.
 */
export default function SmoothScroll() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    if (prefersReducedMotion()) {
      // No smoothing at all — the page is a plain document in this mode.
      ScrollTrigger.refresh();
      return;
    }

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });

    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);

    // GSAP's ticker gives Lenis its clock, so there is exactly one rAF loop.
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Fonts change heights, which changes every trigger's start and end.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) ScrollTrigger.refresh();
    });

    return () => {
      cancelled = true;
      lenis.off("scroll", onScroll);
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}
