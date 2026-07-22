"use client";

export default function ScoreRing({
  score,
  size = 44,
  reason,
}: {
  score: number;
  size?: number;
  reason?: string;
}) {
  const trackColor = score >= 70 ? "#2dd4bf" : score >= 40 ? "#94a3b8" : "#f87171";
  const deg = Math.max(0, Math.min(360, (score / 100) * 360));

  return (
    <div
      title={reason}
      className="relative shrink-0 rounded-full transition-transform"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${trackColor} ${deg}deg, rgb(var(--color-ink-border)) ${deg}deg)`,
      }}
    >
      <div
        className="absolute inset-[3px] flex items-center justify-center rounded-full bg-ink-card text-xs font-bold"
        style={{ color: trackColor }}
      >
        {score}
      </div>
    </div>
  );
}
