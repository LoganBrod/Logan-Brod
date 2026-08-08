"use client";

import { useState } from "react";
import type { CuratedItem } from "@/lib/curate";
import Hanger from "./Hanger";

const SOURCE_LABEL: Record<string, string> = { ebay: "eBay", serpapi: "Retail" };

/** How many pieces hang on one rail before a new one is started. */
const PER_RAIL = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function Garment({ item, index }: { item: CuratedItem; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="group relative flex flex-1 justify-center"
      // Hover handles the mouse; focus and tap handle keyboard and touch, where
      // hover either doesn't exist or fires as a stray first tap.
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // First tap on a touch device reveals the detail; the second opens it.
          if (!open && window.matchMedia("(hover: none)").matches) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="block w-full max-w-[190px] rounded-b-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{ animationDelay: `${index * 70}ms` }}
        aria-label={`${item.title}, $${item.price.toFixed(2)}`}
      >
        <div className="animate-fade-up">
          {/* Hangs from the rail: hook first, then the garment below it. */}
          <div className="relative z-10 -mt-[26px] flex justify-center text-wardrobe-rail">
            <Hanger className="h-[30px] w-16" />
          </div>

          <div
            className={`relative origin-top overflow-hidden rounded-lg border border-room-line bg-room-panel transition-all duration-300 ${
              open
                ? "-translate-y-0.5 shadow-lift"
                : "shadow-hang motion-safe:animate-sway"
            }`}
            style={{ animationDelay: `${index * 400}ms` }}
          >
            <div className="aspect-[3/4] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>

            {/* The description rides inside the garment card. Floating it above
                would be clipped by the wardrobe's rounded frame, and anywhere
                outside the card can cover the piece hanging next to it. */}
            <div
              className={`absolute inset-x-0 bottom-0 bg-room-panel/97 px-3 py-3 text-left backdrop-blur-sm transition-transform duration-300 ${
                open ? "translate-y-0" : "translate-y-full"
              }`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-room-ink">
                  ${item.price.toFixed(2)}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-room-faint">
                  {SOURCE_LABEL[item.source] ?? item.source}
                </span>
              </div>
              <p className="mb-1.5 line-clamp-2 text-[11px] font-medium leading-snug text-room-ink">
                {item.title}
              </p>
              <p className="line-clamp-4 text-[11px] leading-relaxed text-room-muted">
                {item.whyItFits}
              </p>
              {item.condition && (
                <p className="mt-1.5 text-[9px] uppercase tracking-wider text-room-faint">
                  {item.condition}
                </p>
              )}
            </div>
          </div>
        </div>
      </a>
    </div>
  );
}

function Rail({ items, offset }: { items: CuratedItem[]; offset: number }) {
  return (
    <div className="relative px-6 pb-10 pt-14 sm:px-10">
      {/* the rail itself */}
      <div className="absolute inset-x-6 top-12 h-[3px] rounded-full bg-gradient-to-b from-wardrobe-rail to-wardrobe-shadow sm:inset-x-10" />

      {/* Each garment is flex-1 with its own max width, so a part-full rail
          spaces its pieces evenly rather than bunching them to one end. */}
      <div className="flex items-start justify-around gap-3 sm:gap-5">
        {items.map((item, i) => (
          <Garment key={item.id} item={item} index={offset + i} />
        ))}
      </div>
    </div>
  );
}

export default function Closet({ items }: { items: CuratedItem[] }) {
  if (!items.length) {
    return (
      <div className="panel px-6 py-16 text-center">
        <p className="text-sm text-room-muted">
          The closet came back empty. Try widening the price range, or adding pieces with a
          clearer read on them.
        </p>
      </div>
    );
  }

  const rails = chunk(items, PER_RAIL);

  return (
    <div className="overflow-hidden rounded-2xl border border-room-line bg-wardrobe-door shadow-hang">
      {/* interior back panel, lit from the top as in the render */}
      <div
        className="p-2 sm:p-3"
        style={{
          background:
            "linear-gradient(180deg, #DCD3C2 0%, #EFEBE2 14%, #E8E3D8 60%, #DED8CB 100%)",
        }}
      >
        <div className="rounded-xl border border-room-line/60">
          {rails.map((rail, i) => (
            <div
              key={i}
              className={i > 0 ? "border-t border-room-line/50" : undefined}
            >
              <Rail items={rail} offset={i * PER_RAIL} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
