"use client";

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

/**
 * The hero's 3D listing stage. Cards sit on a perspective stage and tilt
 * toward the cursor, so the front listing reads as lifting off the page.
 * Motion here is doing a job: it shows what the product outputs, and the
 * rotation through categories shows it is not clothing-only.
 */

interface ShowcaseItem {
  title: string;
  price: string;
  condition: string;
  score: number;
  seed: string;
}

interface Category {
  id: string;
  label: string;
  items: ShowcaseItem[];
}

const CATEGORIES: Category[] = [
  {
    id: "streetwear",
    label: "Streetwear",
    items: [
      { title: "Carhartt Detroit Jacket, Brown Duck, L", price: "92.00", condition: "Very good", score: 86, seed: "levoz-jacket" },
      { title: "Vintage Champion Hoodie, Faded Navy, XL", price: "58.00", condition: "Good", score: 74, seed: "levoz-hoodie" },
      { title: "Levi's 501 Selvedge, W32 L30", price: "78.00", condition: "Excellent", score: 81, seed: "levoz-denim" },
    ],
  },
  {
    id: "collectables",
    label: "Collectables",
    items: [
      { title: "1999 Holo Trading Card, PSA 8", price: "340.00", condition: "Graded", score: 93, seed: "levoz-card" },
      { title: "First Pressing Vinyl LP, Gatefold", price: "128.00", condition: "Near mint", score: 88, seed: "levoz-vinyl" },
      { title: "Cast Iron Mechanical Bank, 1920s", price: "215.00", condition: "Original paint", score: 79, seed: "levoz-antique" },
    ],
  },
  {
    id: "sneakers",
    label: "Sneakers",
    items: [
      { title: "Air Force 1 Low, White, US 10, Deadstock", price: "134.00", condition: "New in box", score: 91, seed: "levoz-af1" },
      { title: "Suede Runner, Retro Colourway, US 9", price: "86.00", condition: "Lightly worn", score: 72, seed: "levoz-runner" },
      { title: "High Top Basketball, OG Box, US 11", price: "260.00", condition: "Very good", score: 84, seed: "levoz-hightop" },
    ],
  },
  {
    id: "tech",
    label: "Cameras and tech",
    items: [
      { title: "35mm SLR Body, Meter Tested, Working", price: "185.00", condition: "Fully working", score: 87, seed: "levoz-camera" },
      { title: "Portable Console, Boxed, Region Free", price: "142.00", condition: "Good", score: 76, seed: "levoz-console" },
      { title: "Studio Headphones, Recabled, Pads New", price: "96.00", condition: "Refurbished", score: 82, seed: "levoz-audio" },
    ],
  },
];

const ROTATE_MS = 4200;

export default function HeroShowcase() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const category = CATEGORIES[index];

  // Auto-advance through categories. Paused entirely for reduced motion,
  // where the stage stays on one category instead.
  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % CATEGORIES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [reduceMotion]);

  // Cursor parallax, driven by motion values so it never re-renders React.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 120, damping: 18, mass: 0.6 };
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [14, -14]), spring);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [-11, 11]), spring);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() {
    px.set(0);
    py.set(0);
  }

  return (
    <div className="relative">
      {/* Soft pool of brand light behind the stage */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-3xl dark:bg-brand/10"
      />

      {/* No overflow clipping here: the front card's drop shadow needs to
          spill outside the stage box for the lift to read. The fan is scaled
          down below sm instead, which keeps it inside a phone viewport. */}
      <div
        className="stage-3d relative mx-auto flex h-[17rem] w-full max-w-3xl items-center justify-center sm:h-[23rem]"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <motion.div
          className="preserve-3d relative h-full w-full scale-[0.62] sm:scale-90 lg:scale-100"
          style={reduceMotion ? undefined : { rotateX, rotateY }}
        >
          <AnimatePresence mode="popLayout">
            {category.items.map((item, i) => (
              <ShowcaseCard
                key={`${category.id}-${item.seed}`}
                item={item}
                depth={i}
                reduceMotion={Boolean(reduceMotion)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Category switcher, doubles as a label for what is on the stage */}
      <div className="relative z-20 mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setIndex(i)}
            aria-current={i === index}
            className={
              "relative rounded-full px-3 py-1.5 text-xs font-semibold transition-colors " +
              (i === index ? "text-ink" : "text-fog/50 hover:text-fog/80")
            }
          >
            {i === index && (
              <motion.span
                layoutId="hero-category-pill"
                className="absolute inset-0 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Depth 0 is the front card that lifts off the page; 1 and 2 fan behind it. */
function ShowcaseCard({
  item,
  depth,
  reduceMotion,
}: {
  item: ShowcaseItem;
  depth: number;
  reduceMotion: boolean;
}) {
  // Offsets are measured from the centre of the stage, so each card is
  // centred by its flex wrapper and only the fan offset is animated. Doing
  // it this way avoids fighting a -50% centring translate.
  // Tight overlap plus a big z gap is what makes the front card read as
  // lifting out; spread them apart and it flattens into three tiles.
  const layout = [
    { x: 0, y: 14, z: 150, rot: -2, scale: 1, opacity: 1 },
    { x: 158, y: -34, z: -120, rot: 9, scale: 0.84, opacity: 0.9 },
    { x: -158, y: -26, z: -190, rot: -10, scale: 0.78, opacity: 0.82 },
  ][depth];

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.article
        initial={reduceMotion ? false : { opacity: 0, y: 50, rotateY: -22, z: -240 }}
        animate={{
          opacity: layout.opacity,
          x: layout.x,
          y: layout.y,
          z: layout.z,
          rotate: layout.rot,
          scale: layout.scale,
        }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, z: -240, y: -34 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 90, damping: 18, delay: depth * 0.07 }
        }
        whileHover={
          reduceMotion ? undefined : { z: layout.z + 60, scale: layout.scale * 1.04 }
        }
        style={{ zIndex: 10 - depth }}
        className="preserve-3d pointer-events-auto relative w-48 overflow-hidden rounded-2xl border border-black/5 bg-white text-slate-900 sm:w-56"
      >
        <div
          className="absolute inset-0 -z-10 rounded-2xl"
          style={{ boxShadow: depth === 0 ? "var(--shadow-pop)" : "var(--shadow-card)" }}
        />
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://picsum.photos/seed/${item.seed}/480/360`}
            alt=""
            className="h-full w-full object-cover"
            loading={depth === 0 ? "eager" : "lazy"}
          />
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[10px] font-bold text-brand-dim shadow-sm">
            {item.score}
          </span>
        </div>
        <div className="p-3">
          <p className="line-clamp-2 text-[11px] font-semibold leading-snug">{item.title}</p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-base font-extrabold">${item.price}</span>
            <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
              {item.condition}
            </span>
          </div>
          <div className="mt-2 h-6 rounded-full bg-brand text-center text-[10px] font-bold leading-6 text-ink">
            Buy It Now
          </div>
        </div>
      </motion.article>
    </div>
  );
}
