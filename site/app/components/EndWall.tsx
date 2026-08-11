"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The arrival. The walk's pin releases straight into this: the end-wall clip
 * rises gently into view and settles to rest — the one place deceleration is
 * correct — and the page continues into the website below. No cut.
 */
export default function EndWall() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    gsap.registerPlugin(ScrollTrigger);

    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(video);

    // The smooth handoff: as the walk releases, this frame rises to meet it.
    const tween = gsap.fromTo(
      section.firstElementChild,
      { y: 60, opacity: 0.65 },
      {
        y: 0,
        opacity: 1,
        ease: "none",
        scrollTrigger: { trigger: section, start: "top bottom", end: "top 20%", scrub: true },
      }
    );

    return () => {
      io.disconnect();
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  return (
    <section ref={sectionRef} aria-hidden className="relative h-[70vh] w-full overflow-hidden lg:h-screen">
      <video
        ref={videoRef}
        muted
        playsInline
        preload="metadata"
        poster="/end-wall.jpg"
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
      >
        <source src="/end-wall.webm" type="video/webm" />
        <source src="/end-wall.mp4" type="video/mp4" />
      </video>
    </section>
  );
}
