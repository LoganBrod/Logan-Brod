import type { Insight } from "@/lib/analytics";

const ICONS: Record<string, string> = {
  "best-day": "📅",
  "best-time": "🕐",
  duration: "⏱️",
  "title-length": "✏️",
  keywords: "🔑",
  momentum: "📈",
  engagement: "💬",
  consistency: "🗓️",
};

export default function InsightGrid({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Not enough data yet to detect reliable patterns — insights appear once a
        channel has enough videos with varied posting days, lengths, and titles.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {insights.map((ins) => (
        <div
          key={ins.id}
          className="rounded-xl border border-levoz-border bg-levoz-card p-4"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
            <span aria-hidden>{ICONS[ins.id] ?? "💡"}</span>
            {ins.title}
          </div>
          <div className="mt-2 font-semibold text-levoz-teal">{ins.finding}</div>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{ins.detail}</p>
        </div>
      ))}
    </div>
  );
}
