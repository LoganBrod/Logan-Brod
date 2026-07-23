export interface TickerItem {
  label: string;
  value?: string;
  tone?: "positive" | "negative" | "neutral";
}

const TONE_CLASS: Record<NonNullable<TickerItem["tone"]>, string> = {
  positive: "text-ink-green",
  negative: "text-ink-red",
  neutral: "text-gray-400",
};

function TickerRow({ items }: { items: TickerItem[] }) {
  return (
    <div className="flex items-center gap-8 shrink-0 pr-8">
      {items.map((item, i) => (
        <span key={i} className="text-xs uppercase tracking-wider whitespace-nowrap">
          <span className="text-gray-500">{item.label}</span>
          {item.value && (
            <span className={`ml-2 font-semibold ${TONE_CLASS[item.tone ?? "neutral"]}`}>
              {item.value}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="border-b border-ink-border bg-ink-bg overflow-hidden">
      <div className="flex animate-marquee">
        <TickerRow items={items} />
        <TickerRow items={items} />
      </div>
    </div>
  );
}
