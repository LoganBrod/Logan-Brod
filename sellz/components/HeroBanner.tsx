"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

/**
 * The landing banner: a full-bleed dark block with the headline on the left
 * and a panel of item artwork on the right.
 *
 * This replaced a stage of 3D cards that tilted toward the cursor. The tilt
 * made every card read as floating above the page, which fought the flat,
 * square surfaces used everywhere else. Motion here is deliberately small —
 * the panels drift, and the price tag steps through categories — so the
 * banner shows what the product outputs without the whole thing hovering.
 */

interface Item {
  label: string;
  title: string;
  price: string;
  score: number;
  art: (props: { className?: string }) => JSX.Element;
  tint: string;
}

const ITEMS: Item[] = [
  { label: "Streetwear", title: "Carhartt Detroit Jacket, Brown Duck, L", price: "92.00", score: 86, art: JacketArt, tint: "bg-brand" },
  { label: "Sneakers", title: "Air Force 1 Low, White, US 10, Deadstock", price: "134.00", score: 91, art: SneakerArt, tint: "bg-[#7c5cff]" },
  { label: "Collectables", title: "1999 Holo Trading Card, PSA 8", price: "340.00", score: 93, art: CardArt, tint: "bg-brand" },
  { label: "Cameras and tech", title: "35mm SLR Body, Meter Tested", price: "185.00", score: 87, art: CameraArt, tint: "bg-[#7c5cff]" },
];

const ROTATE_MS = 4200;

export default function HeroBanner() {
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(0);
  const item = ITEMS[i];

  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => setI((n) => (n + 1) % ITEMS.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [reduceMotion]);

  const drift = reduceMotion
    ? {}
    : { animate: { y: [0, -10, 0] }, transition: { duration: 9, repeat: Infinity, ease: "easeInOut" } };

  return (
    <section className="relative overflow-hidden bg-[#0d1112] text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:py-20">
        {/* Left: the claim */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {["ebay", "depop"].map((t) => (
              <span
                key={t}
                className="border border-white/25 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white/70"
              >
                {t}
              </span>
            ))}
          </div>

          <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[0.98] tracking-tight sm:text-[3.4rem] lg:text-[4rem]">
            Priced by what
            <br />
            <span className="text-brand">actually sold</span>
            <br />
            Listed in minutes
          </h1>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/55 sm:text-base">
            Photograph an item and LevoZ writes the listing, prices it against real
            sales, and posts it to eBay once you approve.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/new"
              className="bg-brand px-6 py-3 text-sm font-bold text-[#0d1112] transition hover:bg-brand-dim"
            >
              Start a listing &rarr;
            </Link>
            <Link
              href="/analytics"
              className="border border-white/25 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/60"
            >
              See your numbers
            </Link>
          </div>
        </div>

        {/* Right: item artwork. Two offset columns, echoing the panels the
            listing photos will sit in once the seller has their own. */}
        <div className="relative h-[19rem] sm:h-[23rem] lg:h-[26rem]">
          <motion.div
            {...drift}
            className="absolute bottom-0 left-0 h-[72%] w-[46%] overflow-hidden bg-gradient-to-b from-brand/25 to-brand/5"
          >
            <ItemArtwork item={ITEMS[(i + 1) % ITEMS.length]} />
          </motion.div>

          <motion.div
            {...(reduceMotion
              ? {}
              : { animate: { y: [0, 12, 0] }, transition: { duration: 11, repeat: Infinity, ease: "easeInOut" } })}
            className="absolute right-0 top-0 h-[80%] w-[50%] overflow-hidden bg-[#7c5cff]/20"
          >
            <ItemArtwork item={item} large />
          </motion.div>

          {/* The live read-out: what the app produced for the item on show */}
          <motion.div
            key={item.title}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-4 right-2 w-[62%] border border-white/15 bg-[#151a1b] p-3.5 sm:bottom-6 sm:right-4"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
              {item.label}
            </p>
            <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-white/90">
              {item.title}
            </p>
            <div className="mt-2.5 flex items-end justify-between">
              <span className="text-xl font-extrabold text-white">${item.price}</span>
              <span className="text-[11px] font-bold text-brand">{item.score}/100</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ItemArtwork({ item, large }: { item: Item; large?: boolean }) {
  const Art = item.art;
  return (
    <motion.div
      key={item.title}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex h-full w-full items-center justify-center p-6"
    >
      <Art className={large ? "h-3/4 w-3/4" : "h-2/3 w-2/3"} />
    </motion.div>
  );
}

/* Item artwork. Drawn inline rather than loaded: the banner must not wait on
   a network request, and a stock photo of someone else's item would be a
   claim about inventory this seller does not have. */

function JacketArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" fill="none" className={className} aria-hidden>
      <path d="M45 18 L60 30 L75 18 L100 32 L94 60 L84 56 L84 124 L36 124 L36 56 L26 60 L20 32 Z" fill="#2dd4bf" fillOpacity="0.9" />
      <path d="M60 30 L60 124" stroke="#0d1112" strokeWidth="2.5" />
      <path d="M45 18 L60 30 L75 18" stroke="#0d1112" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="42" y="70" width="12" height="16" fill="#0d1112" fillOpacity="0.35" />
      <rect x="66" y="70" width="12" height="16" fill="#0d1112" fillOpacity="0.35" />
    </svg>
  );
}

function SneakerArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 100" fill="none" className={className} aria-hidden>
      <path d="M14 74 L14 46 L40 46 L58 60 L96 62 C116 63 126 68 126 76 L126 82 L18 82 Z" fill="#ffffff" fillOpacity="0.92" />
      <path d="M14 74 L126 76" stroke="#0d1112" strokeWidth="3" />
      <path d="M40 46 L58 60" stroke="#0d1112" strokeWidth="2.5" />
      <path d="M62 62 C74 52 86 50 96 54" stroke="#2dd4bf" strokeWidth="5" strokeLinecap="round" />
      <rect x="18" y="82" width="108" height="8" fill="#0d1112" fillOpacity="0.55" />
    </svg>
  );
}

function CardArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 140" fill="none" className={className} aria-hidden>
      <rect x="10" y="8" width="80" height="124" fill="#2dd4bf" fillOpacity="0.9" />
      <rect x="18" y="16" width="64" height="72" fill="#0d1112" fillOpacity="0.75" />
      <path d="M30 74 L44 54 L56 70 L66 58 L74 74 Z" fill="#2dd4bf" />
      <rect x="18" y="96" width="46" height="6" fill="#0d1112" fillOpacity="0.5" />
      <rect x="18" y="108" width="30" height="6" fill="#0d1112" fillOpacity="0.35" />
    </svg>
  );
}

function CameraArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 110" fill="none" className={className} aria-hidden>
      <rect x="14" y="30" width="112" height="64" fill="#ffffff" fillOpacity="0.9" />
      <path d="M48 30 L56 16 L86 16 L94 30 Z" fill="#ffffff" fillOpacity="0.9" />
      <circle cx="70" cy="62" r="24" fill="#0d1112" fillOpacity="0.8" />
      <circle cx="70" cy="62" r="13" fill="#2dd4bf" />
      <rect x="20" y="36" width="16" height="8" fill="#0d1112" fillOpacity="0.45" />
    </svg>
  );
}
