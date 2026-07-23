export type BadgeTone = "positive" | "strong" | "gold" | "negative" | "neutral";

const TONE_CLASS: Record<BadgeTone, string> = {
  positive: "border-ink-green text-ink-green",
  strong: "border-ink-green text-ink-green",
  gold: "border-ink-gold text-ink-gold",
  negative: "border-ink-red text-ink-red",
  neutral: "border-gray-600 text-gray-400",
};

export default function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}
