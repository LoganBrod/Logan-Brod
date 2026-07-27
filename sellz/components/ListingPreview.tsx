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
  /** Stored photo ids, if the seller uploaded real photos */
  photos?: string[];
}

function photoCount(note: string): number {
  const m = note.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 4;
  return Math.min(Math.max(n, 1), 12);
}

function PhotoThumb({ photosNote, photos }: { photosNote: string; photos?: string[] }) {
  // Real uploaded photos when we have them, placeholder otherwise
  if (photos && photos.length > 0) {
    return (
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {/* Contain rather than cover so the whole item stays visible */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/photos/${photos[0]}`}
          alt=""
          className="max-h-full max-w-full object-contain"
          loading="lazy"
        />
        {photos.length > 1 && (
          <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 shadow-sm">
            {photos.length} pics
          </span>
        )}
      </div>
    );
  }
  const count = photoCount(photosNote);
  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 15l-5-5-4 4-3-3-6 6" />
      </svg>
      <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 shadow-sm">
        {count} pics
      </span>
    </div>
  );
}

const PLATFORM_LABEL: Record<string, string> = { ebay: "eBay", depop: "Depop", other: "Listing" };
const CTA_LABEL: Record<string, string> = { ebay: "Buy It Now", depop: "Buy now", other: "View listing" };

export default function ListingPreview({ l }: { l: PreviewListing }) {
  const label = PLATFORM_LABEL[l.platform] ?? "Listing";
  const cta = CTA_LABEL[l.platform] ?? "View listing";

  return (
    <div className="overflow-hidden rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
      <div className="flex gap-3">
        <PhotoThumb photosNote={l.photosNote} photos={l.photos} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-dim">
              {label}
            </span>
            {l.condition && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                {l.condition}
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-[14px] font-bold leading-snug text-slate-900">{l.title}</h3>
          {l.category && <p className="mt-0.5 text-[11px] text-slate-400">{l.category}</p>}
          <p className="mt-1 text-lg font-extrabold text-slate-900">${l.price.toFixed(2)}</p>
        </div>
      </div>

      <button className="mt-3 w-full rounded-full bg-brand py-2 text-[12px] font-bold text-ink transition hover:bg-brand-dim">
        {cta}
      </button>

      <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-500">
        {l.description}
      </p>
      {l.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {l.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand-dim"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
