"use client";

interface PreviewListing {
  title: string;
  description: string;
  price: number;
  platform: string;
  condition: string;
  category: string;
  tags: string[];
  photosNote: string;
}

function photoCount(note: string): number {
  const m = note.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 4;
  return Math.min(Math.max(n, 1), 12);
}

const HUES = [180, 210, 260, 320, 20, 150];

function PhotoPlaceholder({ index }: { index: number }) {
  const hue = HUES[index % HUES.length];
  return (
    <div
      className="flex aspect-square w-full items-center justify-center rounded"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 35% 88%), hsl(${hue} 20% 96%))` }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 15l-5-5-4 4-3-3-6 6" />
      </svg>
    </div>
  );
}

export function EbayPreview({ l }: { l: PreviewListing }) {
  const photos = photoCount(l.photosNote);
  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-white text-[#0d1114] shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-black/10 bg-[#f7f7f7] px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
        <span className="h-2 w-2 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate rounded border border-black/10 bg-white px-2 py-0.5 text-[10px] text-black/40">
          ebay.com/itm/{l.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28)}
        </span>
      </div>

      <div className="p-3">
        <p className="text-[12px] font-bold italic tracking-tight">
          <span className="text-[#e53238]">e</span>
          <span className="text-[#0064d2]">b</span>
          <span className="text-[#f5af02]">a</span>
          <span className="text-[#86b817]">y</span>
        </p>

        <div className="mt-2 flex gap-3">
          <div className="w-24 shrink-0 space-y-1">
            <div className="rounded border border-black/10 p-0.5">
              <PhotoPlaceholder index={0} />
            </div>
            {photos > 1 && (
              <div className="grid grid-cols-3 gap-0.5">
                {Array.from({ length: Math.min(photos - 1, 3) }).map((_, i) => (
                  <div key={i} className="rounded border border-black/10 p-0.5">
                    <PhotoPlaceholder index={i + 1} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold leading-snug text-[#0d1114]">{l.title}</h2>
            <p className="mt-0.5 text-[10px] text-[#0064d2]">
              ★★★★★ <span className="text-black/40">(128)</span>
            </p>
            <p className="mt-1.5 text-xl font-bold text-[#0d1114]">${l.price.toFixed(2)}</p>
            <p className="text-[10px] text-black/50">or Best Offer</p>
            <p className="mt-1 text-[10px] text-black/60">
              Condition: <span className="font-semibold text-black/80">{l.condition || "Used"}</span>
            </p>
            <div className="mt-2 space-y-1.5">
              <button className="w-full rounded-full bg-[#3665f3] py-1.5 text-[11px] font-semibold text-white">
                Buy It Now
              </button>
              <button className="w-full rounded-full border border-[#3665f3] py-1.5 text-[11px] font-semibold text-[#3665f3]">
                Add to cart
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 border-t border-black/10 pt-2">
          <p className="text-[10px] text-black/50">Free shipping · 30-day returns</p>
          <h3 className="mt-2 text-[11px] font-bold text-black/70">Item description</h3>
          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-black/70">
            {l.description}
          </p>
          {l.tags.length > 0 && (
            <p className="mt-1 text-[10px] text-black/40">{l.tags.map((t) => `#${t}`).join(" ")}</p>
          )}
          {l.photosNote && <p className="mt-1 text-[10px] text-black/30">📷 {l.photosNote}</p>}
        </div>
      </div>
    </div>
  );
}

export function DepopPreview({ l }: { l: PreviewListing }) {
  const photos = photoCount(l.photosNote);
  return (
    <div className="mx-auto max-w-[260px] overflow-hidden rounded-2xl border border-black/10 bg-white text-black shadow-sm">
      <div className="relative">
        <PhotoPlaceholder index={0} />
        <span className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2">
            <path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5 6 5c2 0 3.5 1.2 4 2.4C10.5 6.2 12 5 14 5c3.5 0 5 4 3.5 7.5C15 16.65 12 21 12 21Z" />
          </svg>
        </span>
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          1/{photos}
        </span>
      </div>
      <div className="p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-5 w-5 rounded-full bg-gradient-to-br from-pink-300 to-purple-300" />
          <span className="text-[11px] font-semibold">@yourshop</span>
        </div>
        <p className="mt-1.5 text-[12px] font-medium leading-snug">{l.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-black/50">
          {l.condition && <span className="rounded-full border border-black/10 px-1.5 py-0.5">{l.condition}</span>}
          {l.category && <span className="rounded-full border border-black/10 px-1.5 py-0.5">{l.category}</span>}
        </div>
        <p className="mt-1.5 text-base font-bold">${l.price.toFixed(2)}</p>
        <button className="mt-1.5 w-full rounded-full bg-black py-1.5 text-[11px] font-semibold text-white">
          Buy now
        </button>
        <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-black/70">{l.description}</p>
        {l.tags.length > 0 && (
          <p className="mt-1 text-[10px] text-[#ff2d55]">{l.tags.map((t) => `#${t}`).join(" ")}</p>
        )}
        {l.photosNote && <p className="mt-1 text-[10px] text-black/30">📷 {l.photosNote}</p>}
      </div>
    </div>
  );
}

export default function ListingPreview({ l }: { l: PreviewListing }) {
  if (l.platform === "depop") return <DepopPreview l={l} />;
  return <EbayPreview l={l} />;
}
