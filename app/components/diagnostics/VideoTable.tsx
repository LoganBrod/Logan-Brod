"use client";

import { useState } from "react";
import type { RankedVideo } from "@/lib/analytics";
import { formatViews, formatDuration } from "@/lib/analytics";

const KIND_LABEL: Record<string, string> = {
  video: "Video",
  vod: "VOD",
  clip: "Clip",
};

export default function VideoTable({ videos }: { videos: RankedVideo[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? videos : videos.slice(0, 15);

  return (
    <div className="rounded-xl border border-levoz-border bg-levoz-card">
      <ol className="divide-y divide-levoz-border">
        {visible.map((v, i) => (
          <li key={v.id}>
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 p-3 transition-colors hover:bg-white/5 sm:gap-4 sm:p-4"
            >
              <div className="w-7 shrink-0 pt-1 text-right font-mono text-sm text-gray-500">
                {i + 1}
              </div>
              {v.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumbnail}
                  alt=""
                  className="hidden h-16 w-28 shrink-0 rounded-lg object-cover sm:block"
                  loading="lazy"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-white" title={v.title}>
                  {v.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                  <span className="font-semibold text-gray-200">
                    {formatViews(v.views)} views
                  </span>
                  {v.engagementRate !== null && (
                    <span>{(v.engagementRate * 100).toFixed(1)}% engagement</span>
                  )}
                  {v.durationSeconds !== null && v.durationSeconds > 0 && (
                    <span>{formatDuration(v.durationSeconds)}</span>
                  )}
                  <span>{new Date(v.publishedAt).toLocaleDateString()}</span>
                  <span className="rounded border border-levoz-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    {KIND_LABEL[v.kind] ?? v.kind}
                  </span>
                </div>
                {/* Score bar: single gold series, direct-labeled */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-levoz-border">
                    <div
                      className="h-full rounded-full bg-levoz-teal"
                      style={{ width: `${Math.max(2, v.score)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-xs text-gray-300">
                    {v.score}/100
                  </span>
                </div>
                {v.reasons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {v.reasons.map((r) => (
                      <span
                        key={r}
                        className="rounded-full border border-levoz-teal/30 bg-levoz-teal/10 px-2 py-0.5 text-[11px] text-levoz-teal"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </a>
          </li>
        ))}
      </ol>
      {videos.length > 15 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full border-t border-levoz-border py-3 text-sm text-gray-400 transition-colors hover:text-white"
        >
          {showAll ? "Show top 15 only" : `Show all ${videos.length} videos`}
        </button>
      )}
    </div>
  );
}
