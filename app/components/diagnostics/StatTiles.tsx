import type { ChannelSummary } from "@/lib/analytics";
import { formatViews } from "@/lib/analytics";

export default function StatTiles({ summary }: { summary: ChannelSummary }) {
  const tiles: { label: string; value: string }[] = [
    { label: "Videos analyzed", value: `${summary.videosAnalyzed}` },
    { label: "Total views", value: formatViews(summary.totalViews) },
    { label: "Median views", value: formatViews(summary.medianViews) },
    { label: "Average views", value: formatViews(summary.avgViews) },
  ];
  if (summary.avgEngagementRate !== null) {
    tiles.push({
      label: "Avg engagement",
      value: `${(summary.avgEngagementRate * 100).toFixed(1)}%`,
    });
  }
  if (summary.uploadsPerWeek !== null) {
    tiles.push({
      label: "Uploads / week",
      value: summary.uploadsPerWeek.toFixed(1),
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-xl border border-roobet-border bg-roobet-card px-4 py-3"
        >
          <div className="text-2xl font-bold text-white">{t.value}</div>
          <div className="mt-1 text-xs text-gray-400">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
