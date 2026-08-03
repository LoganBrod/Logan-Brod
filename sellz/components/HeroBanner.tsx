"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { DenimJacket, Hoodie, Tee, Jeans, type Palette } from "@/components/GarmentArt";
import PrimaryButton from "@/components/PrimaryButton";

/**
 * The landing banner: a full-bleed dark block with the headline on the left
 * and eBay-style listing cards on the right.
 *
 * This replaced a stage of 3D cards that tilted toward the cursor. The tilt
 * made every card read as floating above the page, which fought the flat,
 * square surfaces used everywhere else. What is on show now is the actual
 * output — a finished listing, priced, with the garment hanging in the photo
 * — because that is what the product makes.
 */

interface Item {
  category: string;
  title: string;
  price: string;
  wasPrice?: string;
  condition: string;
  watchers: number;
  shipping: string;
  score: number;
  art: (props: { p: Palette }) => JSX.Element;
  palette: Palette;
  /** Backdrop behind the garment, so each photo doesn't look identical. */
  backdrop: string;
}

const ITEMS: Item[] = [
  {
    category: "Men's Jackets",
    title: "Carhartt Detroit Jacket, Brown Duck, Large",
    price: "92.00",
    wasPrice: "115.00",
    condition: "Pre-owned · Very good",
    watchers: 14,
    shipping: "Free 3 day shipping",
    score: 86,
    art: DenimJacket,
    palette: { fabric: "#b3762f", shade: "#8f5b21", stitch: "#f2d9a8" },
    backdrop: "from-[#f7f2ea] to-[#e8dfd2]",
  },
  {
    category: "Men's Hoodies",
    title: "Vintage Champion Reverse Weave Hoodie, XL",
    price: "58.00",
    condition: "Pre-owned · Good",
    watchers: 9,
    shipping: "Free shipping",
    score: 74,
    art: Hoodie,
    palette: { fabric: "#5a6b86", shade: "#44536b", stitch: "#dbe4f0" },
    backdrop: "from-[#eef1f6] to-[#dde3ec]",
  },
  {
    category: "Women's Tops",
    title: "Single Stitch Graphic Tee, Faded Black, M",
    price: "44.00",
    wasPrice: "55.00",
    condition: "Pre-owned · Excellent",
    watchers: 21,
    shipping: "Free 2 day shipping",
    score: 91,
    art: Tee,
    palette: { fabric: "#3b3b40", shade: "#2b2b2f", stitch: "#cfd2d8" },
    backdrop: "from-[#f4f4f5] to-[#e4e4e7]",
  },
  {
    category: "Men's Jeans",
    title: "Levi's 501 Selvedge Denim, W32 L30",
    price: "78.00",
    condition: "Pre-owned · Excellent",
    watchers: 17,
    shipping: "Free 3 day shipping",
    score: 88,
    art: Jeans,
    palette: { fabric: "#3f5f86", shade: "#31496a", stitch: "#e8c98a" },
    backdrop: "from-[#eff3f8] to-[#dee5ef]",
  },
];

const ROTATE_MS = 5200;

export default function HeroBanner() {
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => setI((n) => (n + 1) % ITEMS.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [reduceMotion]);

  const front = ITEMS[i];
  const behind = ITEMS[(i + 1) % ITEMS.length];

  return (
    <section className="relative overflow-hidden bg-[#0d1112] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
        {/* Left: the claim */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {["depop", "ebay"].map((t) => (
              <span
                key={t}
                className="border border-white/25 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white/70"
              >
                {t}
              </span>
            ))}
          </div>

          <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[0.98] tracking-tight sm:text-[3.4rem] lg:text-[4rem]">
            Turn your thrift
            <br />
            finds into
            <br />
            <span className="text-brand">actual money</span>
          </h1>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/55 sm:text-base">
            Take a photo. It works out what the thing is worth, writes the listing,
            and hands you a Depop post ready to paste &mdash; or puts it on eBay for you.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <PrimaryButton href="/new">Sell something &rarr;</PrimaryButton>
            <Link
              href="/analytics"
              className="rounded-lg border border-white/25 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/60"
            >
              See what you made
            </Link>
          </div>
        </div>

        {/* Right: the finished listings */}
        <div className="relative mx-auto h-[25rem] w-full max-w-[26rem] sm:h-[28rem]">
          {/* The card behind, to suggest a queue of them rather than one item */}
          <div className="absolute right-0 top-2 hidden w-[62%] sm:block">
            <ListingCard key={`behind-${behind.title}`} item={behind} muted />
          </div>

          <motion.div
            key={front.title}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-0 left-0 w-[86%] sm:w-[76%]"
          >
            {/* The grade rides on the photo rather than floating beside the
                card, where it collided with the Buy It Now button. */}
            <ListingCard item={front} showScore />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/** One listing, laid out the way eBay lays them out. */
function ListingCard({
  item,
  muted,
  showScore,
}: {
  item: Item;
  muted?: boolean;
  showScore?: boolean;
}) {
  const Art = item.art;
  return (
    <article
      className={
        "border border-black/10 bg-white text-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.35)] " +
        (muted ? "opacity-45" : "")
      }
    >
      {/* Photo */}
      <div className={`relative aspect-[4/3] bg-gradient-to-b ${item.backdrop} p-3`}>
        <div className="mx-auto h-full w-[52%]">
          <Art p={item.palette} />
        </div>
        <span className="absolute left-2 top-2 bg-white/85 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
          {item.watchers} watching
        </span>
        {showScore && (
          <span className="absolute right-2 top-2 bg-[#0d1112] px-2 py-1 text-[10px] font-extrabold text-brand">
            {item.score}/100
          </span>
        )}
      </div>

      {/* Details */}
      <div className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {item.category}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug">{item.title}</h3>
        <p className="mt-1 text-[11px] text-slate-500">{item.condition}</p>

        <div className="mt-2 flex items-end gap-2">
          <span className="text-xl font-extrabold">${item.price}</span>
          {item.wasPrice && (
            <span className="pb-0.5 text-[11px] text-slate-400 line-through">${item.wasPrice}</span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] font-semibold text-emerald-600">{item.shipping}</p>

        <button className="mt-2.5 w-full bg-brand py-2 text-[12px] font-bold text-[#0d1112]">
          Buy It Now
        </button>
      </div>
    </article>
  );
}
