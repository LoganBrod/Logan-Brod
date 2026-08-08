"use client";

import { useEffect, useRef } from "react";

/**
 * The wardrobe assembling itself while the pipeline runs.
 *
 * The clip is five seconds and a full run is much longer, so it plays once and
 * holds on the finished wardrobe rather than looping — a cabinet that rebuilds
 * itself every five seconds reads as a stutter, and holding the last frame says
 * "built, now filling it" instead.
 */
export default function BuildingCloset({ stage }: { stage: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Autoplay can still be refused; the poster is the final frame, so a
    // refusal degrades to a still of the built wardrobe rather than a blank box.
    void video.play().catch(() => {});
  }, []);

  return (
    <section className="animate-fade-in" aria-live="polite" aria-busy="true">
      <div className="relative overflow-hidden rounded-2xl border border-room-line bg-room-bg">
        <video
          ref={videoRef}
          className="block w-full"
          poster="/closet-building.jpg"
          muted
          playsInline
          preload="auto"
        >
          {/* WebM first for Chromium builds without proprietary codecs; H.264
              second for Safari and iOS, which don't decode VP9 in <video>. */}
          <source src="/closet-building.webm" type="video/webm" />
          <source src="/closet-building.mp4" type="video/mp4" />
        </video>

        {/* Fades the video's backdrop into the page's own so the clip reads as
            part of the room rather than a pasted-in rectangle. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(100% 70% at 50% 40%, rgba(237,234,228,0) 45%, rgba(237,234,228,0.75) 100%)",
          }}
        />
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        <p className="text-sm tracking-wide text-room-muted">{stage}</p>
      </div>
    </section>
  );
}
