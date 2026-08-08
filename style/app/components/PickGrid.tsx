import type { CuratedItem } from "@/lib/curate";

const SOURCE_LABEL: Record<string, string> = {
  ebay: "eBay",
  serpapi: "Retail",
};

export function PickCard({ item }: { item: CuratedItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="panel group flex flex-col overflow-hidden transition-colors hover:border-ink-gold/50"
    >
      <div className="aspect-square overflow-hidden bg-ink-raised">
        {item.imageUrl ? (
          // Plain <img>: listing images come from arbitrary merchant domains,
          // which next/image would need every one of allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-600">
            no image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-white">${item.price.toFixed(2)}</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            {SOURCE_LABEL[item.source] ?? item.source}
          </span>
        </div>

        <p className="line-clamp-2 text-sm leading-snug text-gray-300">{item.title}</p>
        <p className="mt-auto text-xs leading-relaxed text-gray-500">{item.whyItFits}</p>
      </div>
    </a>
  );
}

export default function PickGrid({ items }: { items: CuratedItem[] }) {
  if (!items.length) {
    return (
      <p className="panel p-6 text-sm text-gray-500">
        Nothing came back that fit. Try widening the price range or uploading pieces with a
        clearer read on them.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <PickCard key={item.id} item={item} />
      ))}
    </div>
  );
}
