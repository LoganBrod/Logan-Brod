export interface StatItem {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
}

const DELTA_TONE_CLASS: Record<NonNullable<StatItem["deltaTone"]>, string> = {
  positive: "text-ink-green",
  negative: "text-ink-red",
  neutral: "text-gray-500",
};

export default function StatPanel({ items }: { items: StatItem[] }) {
  return (
    <div className="border border-ink-border rounded-2xl mb-8 grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-border overflow-hidden">
      {items.map((item) => (
        <div key={item.label} className="bg-ink-card p-5">
          <p className="text-gray-500 text-[11px] uppercase tracking-widest mb-1">{item.label}</p>
          <p className="text-white font-bold text-xl truncate">{item.value}</p>
          {item.delta && (
            <p className={`text-xs mt-1 ${DELTA_TONE_CLASS[item.deltaTone ?? "neutral"]}`}>
              {item.delta}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
