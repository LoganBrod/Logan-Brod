"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { MOTION, prefersReducedMotion } from "@/lib/motion";

/**
 * A dot that tracks the pointer exactly and a ring that trails it by lerp.
 * Never shown on touch, and never a substitute for a focus ring.
 */
export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches || prefersReducedMotion()) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    document.body.dataset.cursor = "custom";
    gsap.set([dot, ring], { xPercent: -50, yPercent: -50, opacity: 0 });

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const trail = { ...pointer };
    let shown = false;

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      gsap.set(dot, { x: pointer.x, y: pointer.y });
      if (!shown) {
        shown = true;
        gsap.to([dot, ring], { opacity: 1, duration: 0.3 });
      }
    };

    const tick = () => {
      trail.x += (pointer.x - trail.x) * MOTION.cursorLerp;
      trail.y += (pointer.y - trail.y) * MOTION.cursorLerp;
      gsap.set(ring, { x: trail.x, y: trail.y });
    };
    gsap.ticker.add(tick);

    // The ring reports what is under the pointer: wider and brass over a bag,
    // collapsed to a bar over text.
    const onOver = (e: PointerEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-cursor-target]");
      const kind = el?.getAttribute("data-cursor-target") ?? "default";
      if (kind === "bag") {
        gsap.to(ring, { width: 64, height: 64, borderRadius: 999, borderColor: "rgba(138,116,72,0.4)", duration: 0.22, ease: "power2.out" });
        gsap.to(dot, { scale: 0.5, duration: 0.22, ease: "power2.out" });
      } else if (kind === "text") {
        gsap.to(ring, { width: 2, height: 28, borderRadius: 1, borderColor: "#1B1A17", duration: 0.22, ease: "power2.out" });
        gsap.to(dot, { scale: 0, duration: 0.22, ease: "power2.out" });
      } else {
        gsap.to(ring, { width: 36, height: 36, borderRadius: 999, borderColor: "#D6D1C7", duration: 0.22, ease: "power2.out" });
        gsap.to(dot, { scale: 1, duration: 0.22, ease: "power2.out" });
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });

    return () => {
      delete document.body.dataset.cursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      gsap.ticker.remove(tick);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 hidden lg:block">
      <div ref={ringRef} className="fixed left-0 top-0 h-9 w-9 rounded-full border border-room-line" />
      <div ref={dotRef} className="fixed left-0 top-0 h-2.5 w-2.5 rounded-full bg-room-ink" />
    </div>
  );
}
