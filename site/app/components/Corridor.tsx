"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { bays } from "@/lib/copy";
import { BAY_GAP, MOTION, PLANE, isDesktop, prefersReducedMotion, restingTilt, swingSide } from "@/lib/motion";
import GarmentBag from "./GarmentBag";

const BAY_PLATES = ["/bay-1.webp", "/bay-2.webp", "/bay-3.webp", "/bay-4.webp"];

/**
 * The corridor. Bays sit at fixed translateZ depths and never move; one master
 * ScrollTrigger scrubs the camera's translateZ across the whole page height.
 * Because it's real 3D perspective, near things move faster than far things
 * for free — no hand-authored parallax anywhere.
 *
 * Below lg none of this runs: the bays lay out as a vertical flow with
 * per-bay fade-and-rise reveals (handled in CSS + the mobile effect below).
 */
export default function Corridor() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    const reduced = prefersReducedMotion();
    const bayEls = Array.from(camera.querySelectorAll<HTMLElement>("[data-bay-section]"));

    // Mobile and reduced motion: plain document, discrete reveals only.
    if (!isDesktop() || reduced) {
      if (reduced) return;
      const tweens = bayEls.map((el) =>
        gsap.fromTo(
          el,
          { opacity: 0, y: 24 },
          {
            opacity: 1,
            y: 0,
            duration: MOTION.reveal.duration,
            ease: MOTION.reveal.ease,
            scrollTrigger: { trigger: el, start: "top 75%" },
          }
        )
      );
      return () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
    }

    const totalDepth = BAY_GAP * bays.length;
    const ctx = gsap.context(() => {
      // The single value that is the camera. Everything else keys off it.
      gsap.fromTo(
        camera,
        { z: 0 },
        {
          z: totalDepth,
          ease: "none",
          scrollTrigger: {
            trigger: scene,
            start: "top top",
            end: "bottom bottom",
            scrub: MOTION.cameraScrub,
          },
        }
      );

      bayEls.forEach((el, i) => {
        const bag = el.querySelector<HTMLElement>("[data-bag]");
        const frost = el.querySelector<HTMLElement>("[data-frost]");
        const reveals = el.querySelectorAll<HTMLElement>("[data-reveal]");
        if (!bag || !frost) return;

        const tilt = restingTilt(i);
        gsap.set(bag, { rotation: tilt });

        // The bay's own timeline, keyed to the camera's approach to its depth.
        // Progress 0 = one full gap away, 1 = camera at the bay.
        const start = ((i - 1) * BAY_GAP) / totalDepth;
        const end = (i * BAY_GAP) / totalDepth;

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: scene,
            start: () => `top+=${start * (scene.scrollHeight - window.innerHeight)} top`,
            end: () => `top+=${end * (scene.scrollHeight - window.innerHeight)} top`,
            scrub: true,
          },
        });

        // ~35%: the bag swings out from the rail toward centre and straightens.
        tl.to(bag, {
          rotation: 0,
          rotationY: swingSide(i) * 4,
          z: PLANE.garment,
          duration: 0.25,
          ease: MOTION.bagSwing.ease,
        }, 0.35);

        // ~60%: the frost clears and the face resolves.
        tl.to(frost, { opacity: 0, duration: 0.15, ease: "none" }, 0.6);

        // ~70%: heading, body, label rise in turn.
        tl.fromTo(reveals, { opacity: 0, y: 24 }, {
          opacity: 1,
          y: 0,
          duration: 0.2,
          stagger: MOTION.textStagger,
          ease: "none",
        }, 0.7);

        // Past the bay it recedes and re-frosts — scrub back and it reverses
        // exactly, because everything above is on the same scrubbed timeline.
      });
    }, scene);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sceneRef} className="relative" style={{ height: `${(bays.length + 1) * 100}vh` }}>
      <div className="scene sticky top-0 h-screen w-full overflow-hidden">
        <div ref={cameraRef} className="camera relative h-full w-full">
          {bays.map((bay, i) => (
            <section
              key={i}
              data-bay-section
              className="bay absolute left-1/2 top-1/2 w-full max-w-4xl px-6 max-lg:relative max-lg:left-auto max-lg:top-auto max-lg:mx-auto max-lg:py-24"
              style={{ "--z": `${-(i + 1) * BAY_GAP}px` } as React.CSSProperties}
            >
              {/* Back wall plane: the generated plate for this bay. */}
              <div
                aria-hidden
                className="absolute inset-x-0 top-1/2 -z-10 hidden aspect-video -translate-y-1/2 bg-cover bg-center lg:block"
                style={{
                  backgroundImage: `url(${BAY_PLATES[i % BAY_PLATES.length]})`,
                  transform: `translateY(-50%) translateZ(${PLANE.wall}px)`,
                }}
              />
              {/* Rail plane. */}
              <div aria-hidden className="rail absolute inset-x-[8%] top-[18%] hidden h-0.5 lg:block" />

              <div className="lg:pt-[22%]">
                <GarmentBag bay={bay} index={i} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
