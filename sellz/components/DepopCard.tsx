"use client";

/**
 * A listing drawn the way Depop draws it.
 *
 * The point isn't decoration. Depop gives sellers no API and no dashboard we
 * can embed, so this is the only place the seller sees their Depop listing
 * outside the Depop app — and a row of eBay-style text makes it feel like a
 * note they typed rather than a thing that is live somewhere. A square photo,
 * the price under it, a SOLD band when it's gone: that reads as the listing.
 *
 * Everything shown is either our own photo or a number the seller entered.
 * Nothing here is fetched from Depop, and the card never implies it is — the
 * "you told us" caption is load-bearing honesty, not a disclaimer.
 */

interface Props {
  title: string;
  price: number;
  photos?: string[];
  imageUrls?: string[];
  status: string;
  /** Depop calls eBay's watchers "likes"; same field, right label. */
  likes?: number;
  views?: number;
  soldPrice?: number;
  onClick?: () => void;
}

function money(n: number): string {
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

export default function DepopCard({
  title,
  price,
  photos,
  imageUrls,
  status,
  likes = 0,
  views = 0,
  soldPrice,
  onClick,
}: Props) {
  const src = photos?.length
    ? `/api/photos/${photos[0]}`
    : imageUrls?.length
      ? imageUrls[0]
      : null;
  const sold = status === "sold";

  return (
    <button
      onClick={onClick}
      className="group block w-full text-left"
      aria-label={title}
    >
      {/* Square, because Depop's grid is square and a 4:3 thumbnail
          immediately reads as a different app. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-ink-deep">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            loading="lazy"
            className={
              "h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] " +
              (sold ? "opacity-45 saturate-50" : "")
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-fog/25">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="10" r="1.5" />
              <path d="m21 15-5-5L5 19" />
            </svg>
          </div>
        )}

        {sold && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-ink/85 px-4 py-1.5 text-xs font-black tracking-widest text-fog">
              SOLD
            </span>
          </div>
        )}

        {/* Depop puts likes on the photo, not in a stats row below it. */}
        {!sold && likes > 0 && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-ink/70 px-2 py-1 text-[11px] font-semibold text-fog backdrop-blur">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0 1 12 6.5 5.3 5.3 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9Z" />
            </svg>
            {likes}
          </span>
        )}
      </div>

      <div className="mt-2 px-0.5">
        <p className="text-sm font-bold text-fog">
          {sold && soldPrice !== undefined ? money(soldPrice) : money(price)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-fog/55">{title}</p>
        {!sold && views > 0 && (
          <p className="mt-1 text-[11px] text-fog/35">{views} views — you told us</p>
        )}
      </div>
    </button>
  );
}
