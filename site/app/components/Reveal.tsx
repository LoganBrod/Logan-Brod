"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bring a block in as it arrives.
 *
 * An IntersectionObserver rather than a scroll handler: the browser does the
 * work off the main thread and it costs nothing while the section is off
 * screen, which matters on a page that will end up with a dozen of these.
 *
 * It fires once and disconnects. A section that fades out again when you scroll
 * back up reads as a bug rather than as motion — you already read that part,
 * and taking it away to re-animate it is a small insult.
 *
 * Anyone who has asked for less movement gets the content, immediately, with no
 * transition at all: the whole thing is opacity and eight pixels, so there is
 * nothing lost by skipping it.
 */
export default function Reveal({
  children,
  /** Seconds of hold before this one starts, for staggering a row. */
  delay = 0,
  /** How far it travels. Small on purpose — this is punctuation, not staging. */
  distance = 18,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // A little before the bottom edge, so a block is already moving by the
      // time it is properly in view rather than starting once you are looking
      // straight at it.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.22,0.9,0.3,1)] ${className}`}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${distance}px)`,
        transitionDelay: shown ? `${delay}s` : "0s",
      }}
    >
      {children}
    </div>
  );
}
