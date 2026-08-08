import type { CuratedItem } from "@/lib/curate";
import type { Outfit } from "@/lib/schemas";

export default function OutfitList({
  outfits,
  items,
}: {
  outfits: Outfit[];
  items: CuratedItem[];
}) {
  if (!outfits.length) return null;

  const byId = new Map(items.map((item) => [item.id, item]));

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl text-white">Put together</h2>

      {outfits.map((outfit) => {
        const pieces = outfit.itemIds
          .map((id) => byId.get(id))
          .filter((item): item is CuratedItem => Boolean(item));

        return (
          <article key={outfit.name} className="panel p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-serif text-xl text-ink-gold">{outfit.name}</h3>
              <span className="text-xs text-gray-500">{outfit.occasion}</span>
            </div>

            <div className="mb-4 flex flex-wrap gap-3">
              {pieces.map((piece) => (
                <a
                  key={piece.id}
                  href={piece.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-36 flex-col gap-1.5 text-xs text-gray-400 hover:text-white"
                >
                  <div className="aspect-square overflow-hidden rounded-lg border border-ink-border bg-ink-raised">
                    {piece.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={piece.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <span className="line-clamp-2 leading-snug">{piece.title}</span>
                  <span className="text-gray-500">${piece.price.toFixed(2)}</span>
                </a>
              ))}
            </div>

            <p className="text-sm leading-relaxed text-gray-400">{outfit.stylingNote}</p>

            <p className="mt-3 text-xs text-gray-600">
              Total $
              {pieces.reduce((sum, piece) => sum + piece.price, 0).toFixed(2)}
            </p>
          </article>
        );
      })}
    </section>
  );
}
