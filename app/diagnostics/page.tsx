"use client";

import { useState } from "react";
import type { Diagnostics } from "@/lib/analytics";
import { formatViews } from "@/lib/analytics";
import StatTiles from "../components/diagnostics/StatTiles";
import InsightGrid from "../components/diagnostics/InsightGrid";
import VideoTable from "../components/diagnostics/VideoTable";

type Platform = "youtube" | "twitch";

interface ApiResponse extends Diagnostics {
  channel: {
    name: string;
    url: string;
    avatar: string | null;
    followers: number | null;
    platform: Platform;
  };
}

const PLATFORMS: { id: Platform; label: string; dot: string; placeholder: string }[] = [
  {
    id: "youtube",
    label: "YouTube",
    dot: "bg-[#FF0000]",
    placeholder: "@handle, channel URL, or channel name",
  },
  {
    id: "twitch",
    label: "Twitch",
    dot: "bg-[#9146FF]",
    placeholder: "username or twitch.tv URL",
  },
];

export default function DiagnosticsPage() {
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  async function runDiagnostics(e: React.FormEvent) {
    e.preventDefault();
    if (!channel.trim() || loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(
        `/api/diagnostics?platform=${platform}&channel=${encodeURIComponent(channel.trim())}`
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const activePlatform = PLATFORMS.find((p) => p.id === platform)!;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <header className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          Channel <span className="rank-gold">Diagnostics</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-gray-400">
          Analyze any YouTube or Twitch channel to see which videos perform best
          — and the patterns behind why they win.
        </p>
      </header>

      <form onSubmit={runDiagnostics} className="mt-8">
        <div className="flex justify-center gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              aria-pressed={platform === p.id}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                platform === p.id
                  ? "border-roobet-gold bg-roobet-gold/10 text-white"
                  : "border-roobet-border bg-roobet-card text-gray-400 hover:text-white"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${p.dot}`} aria-hidden />
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder={activePlatform.placeholder}
            className="min-w-0 flex-1 rounded-xl border border-roobet-border bg-roobet-card px-4 py-3 text-white placeholder-gray-500 outline-none transition-colors focus:border-roobet-gold"
          />
          <button
            type="submit"
            disabled={loading || !channel.trim()}
            className="gold-gradient shrink-0 rounded-xl px-5 py-3 font-semibold text-black transition-opacity disabled:opacity-40"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-10 text-center text-sm text-gray-400">
          <div className="animate-pulse-slow text-3xl">📡</div>
          <p className="mt-2">
            Fetching {activePlatform.label} data and crunching the numbers…
          </p>
        </div>
      )}

      {data && (
        <div className="animate-fade-in mt-10 space-y-8">
          <section className="flex items-center gap-4 rounded-xl border border-roobet-border bg-roobet-card p-4">
            {data.channel.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.channel.avatar}
                alt=""
                className="h-14 w-14 rounded-full"
              />
            ) : null}
            <div className="min-w-0">
              <a
                href={data.channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-bold text-white hover:text-roobet-gold"
              >
                {data.channel.name}
              </a>
              <div className="text-sm text-gray-400">
                {data.channel.platform === "youtube" ? "YouTube" : "Twitch"}
                {data.channel.followers !== null &&
                  ` · ${formatViews(data.channel.followers)} ${
                    data.channel.platform === "youtube" ? "subscribers" : "followers"
                  }`}
              </div>
            </div>
          </section>

          <StatTiles summary={data.summary} />

          <section>
            <h2 className="mb-3 text-xl font-bold">
              Why your top videos <span className="rank-gold">win</span>
            </h2>
            <InsightGrid insights={data.insights} />
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold">
              Videos ranked by <span className="rank-gold">performance</span>
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              Score blends lifetime views, views-per-day velocity
              {data.summary.avgEngagementRate !== null ? ", and engagement" : ""} —
              gold chips explain what each top video did right.
            </p>
            <VideoTable videos={data.videos} />
          </section>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="mt-12 grid gap-3 text-center text-sm text-gray-500 sm:grid-cols-3">
          <div className="rounded-xl border border-roobet-border p-4">
            <div className="text-2xl" aria-hidden>🏆</div>
            <p className="mt-2">Ranks every video by views, velocity & engagement</p>
          </div>
          <div className="rounded-xl border border-roobet-border p-4">
            <div className="text-2xl" aria-hidden>🔍</div>
            <p className="mt-2">Finds your best posting day, video length & title patterns</p>
          </div>
          <div className="rounded-xl border border-roobet-border p-4">
            <div className="text-2xl" aria-hidden>💡</div>
            <p className="mt-2">Explains why each top performer worked</p>
          </div>
        </div>
      )}
    </main>
  );
}
