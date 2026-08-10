"use client";

import { useEffect, useState } from "react";
import { isDesktop, prefersReducedMotion } from "@/lib/motion";

/**
 * The seamless dust-and-light loop laid across the whole page at low opacity,
 * screen-blended. It adds air; it must never draw the eye. Desktop only — one
 * more compositing layer is not worth it on a phone.
 */
export default function DustOverlay() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(isDesktop() && !prefersReducedMotion());
  }, []);

  if (!on) return null;

  return (
    <video
      muted
      loop
      autoPlay
      playsInline
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 h-full w-full object-cover opacity-[0.12] mix-blend-screen"
    >
      <source src="/dust.webm" type="video/webm" />
      <source src="/dust.mp4" type="video/mp4" />
    </video>
  );
}
