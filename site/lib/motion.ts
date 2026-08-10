// The numbers from the build brief, in one place so no component invents its
// own. Nothing here overshoots: no back, no elastic, no bounce. One instance of
// overshoot undoes the register of the whole site.

export const MOTION = {
  cameraScrub: 1.2,
  reveal: { duration: 1.1, ease: "power2.out" },
  bagSwing: { duration: 1.6, ease: "power3.inOut" },
  textStagger: 0.08,
  cursorLerp: 0.12,
} as const;

/** Depth between bays, in px of translateZ. */
export const BAY_GAP = 1800;

/** A bay's own three planes, so it reads as a space rather than a flat card. */
export const PLANE = { wall: -120, rail: 0, garment: 90 } as const;

/**
 * A deterministic resting tilt per bay, so bags read as hung rather than
 * pasted. Derived from the index — never random, or it would change on every
 * render and fight React.
 */
export function restingTilt(index: number): number {
  return (index % 2 ? 1 : -1) * (0.7 + (index % 3) * 0.35);
}

/** Bays alternate which side of the rail they swing from. */
export function swingSide(index: number): 1 | -1 {
  return index % 2 === 0 ? -1 : 1;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The corridor and its scrubber are desktop-only. */
export function isDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}
