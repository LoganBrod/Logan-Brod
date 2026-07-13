"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeepDiagnostics, DeepVideo } from "@/lib/youtubeAnalytics";
import { formatViews } from "@/lib/analytics";
import InsightGrid from "./InsightGrid";

type State =
  | { status: "loading" }
  | { status: "disconnected" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DeepDiagnostics };

export default function DeepDive() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/diagnostics/deep");
      if (res.status === 401) {
        setState({ status: "disconnected" });
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      setState({ status: "ready", data: body });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function disconnect() {
    await fetch("/api/auth/youtube/disconnect", { method: "POST" });
    setState({ status: "disconnected" });
  }

  return (
    <section className="mt-10 rounded-2xl border border-levoz-teal/30 bg-levoz-card/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">
          Deep dive: <span className="rank-teal">your own channel</span>
        </h2>
        {state.status === "ready" && (
          <button
            onClick={disconnect}
            className="text-xs text-gray-500 underline decoration-dotted hover:text-gray-300"
          >
            Disconnect
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-400">
        Sign in with the Google account that owns your channel to unlock private
        analytics: watch time, retention, traffic sources, and which videos
        actually convert viewers into subscribers.
      </p>

      {state.status === "loading" && (
        <p className="mt-6 animate-pulse text-sm text-gray-400">
          Checking your YouTube connection…
        </p>
      )}

      {state.status === "disconnected" && (
        <a
          href="/api/auth/youtube"
          className="teal-gradient mt-5 inline-block rounded-xl px-5 py-3 font-semibold text-black"
        >
          Connect your YouTube account
        </a>
      )}

      {state.status === "error" && (
        <div className="mt-5 space-y-3">
          <div
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {state.message}
          </div>
          <button
            onClick={load}
            className="text-sm text-gray-400 underline decoration-dotted hover:text-white"
          >
            Try again
          </button>
        </div>
      )}

      {state.status === "ready" && <DeepDashboard data={state.data} />}
    </section>
  );
}

function DeepDashboard({ data }: { data: DeepDiagnostics }) {
  const tiles = [
    { label: "Lifetime views", value: formatViews(data.totals.views) },
    { label: "Watch hours", value: formatViews(data.totals.watchHours) },
    { label: "Subs gained", value: formatViews(data.totals.subsGained) },
    { label: "Avg retention", value: `${data.totals.avgRetentionPct}%` },
  ];
  const maxWeekday = Math.max(...data.weekday.map((w) => w.views), 1);

  return (
    <div className="mt-6 space-y-8">
      <div className="flex items-center gap-3">
        {data.channel.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.channel.avatar} alt="" className="h-10 w-10 rounded-full" />
        ) : null}
        <a
          href={data.channel.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-white hover:text-levoz-teal"
        >
          {data.channel.name}
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-levoz-border bg-levoz-card px-4 py-3"
          >
            <div className="text-2xl font-bold text-white">{t.value}</div>
            <div className="mt-1 text-xs text-gray-400">{t.label}</div>
          </div>
        ))}
      </div>

      <InsightGrid insights={data.insights} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* When the audience watches (last 365 days) */}
        <div className="rounded-xl border border-levoz-border bg-levoz-card p-4">
          <h3 className="text-sm font-semibold text-white">
            Views by weekday <span className="font-normal text-gray-500">(last 365 days)</span>
          </h3>
          <div className="mt-3 space-y-2">
            {data.weekday.map((w) => (
              <div key={w.day} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-gray-400">{w.day}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-levoz-border/50">
                  <div
                    className="h-full rounded-r bg-levoz-teal"
                    style={{ width: `${Math.max(1, (w.views / maxWeekday) * 100)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-gray-300">
                  {formatViews(w.views)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Traffic sources */}
        <div className="rounded-xl border border-levoz-border bg-levoz-card p-4">
          <h3 className="text-sm font-semibold text-white">Traffic sources</h3>
          <div className="mt-3 space-y-2">
            {data.trafficSources.slice(0, 7).map((t) => (
              <div key={t.source} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-gray-400" title={t.source}>
                  {t.source}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-levoz-border/50">
                  <div
                    className="h-full rounded-r bg-levoz-teal"
                    style={{ width: `${Math.max(1, t.pct)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-gray-300">
                  {t.pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <VideoList
          title="💎 Hidden gems"
          subtitle="High retention, few views — fix the packaging"
          videos={data.hiddenGems}
          metric={(v) => `${v.retentionPct.toFixed(0)}% watched`}
        />
        <VideoList
          title="🧲 Subscriber magnets"
          subtitle="Best at converting viewers to subscribers"
          videos={data.subMagnets}
          metric={(v) => `${((v.subsGained / v.views) * 1000).toFixed(1)} subs/1K views`}
        />
        <VideoList
          title="⚠️ Retention laggards"
          subtitle="Popular but viewers bail early"
          videos={data.retentionLaggards}
          metric={(v) => `${v.retentionPct.toFixed(0)}% watched`}
        />
      </div>
    </div>
  );
}

function VideoList({
  title,
  subtitle,
  videos,
  metric,
}: {
  title: string;
  subtitle: string;
  videos: DeepVideo[];
  metric: (v: DeepVideo) => string;
}) {
  return (
    <div className="rounded-xl border border-levoz-border bg-levoz-card p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      {videos.length === 0 ? (
        <p className="mt-3 text-xs text-gray-600">Nothing stands out here — good sign.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {videos.map((v) => (
            <li key={v.id} className="text-xs">
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate font-medium text-gray-200 hover:text-levoz-teal"
                title={v.title}
              >
                {v.title}
              </a>
              <span className="text-gray-500">
                {formatViews(v.views)} views · {metric(v)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
