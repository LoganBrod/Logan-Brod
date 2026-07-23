"use client";

import { useCallback, useState } from "react";
import SiteNav from "../components/SiteNav";
import type { BuzzResult } from "../api/buzz/route";

function sentimentLabel(score: number) {
  if (score > 0.15) return { text: "Positive", className: "text-roobet-green" };
  if (score < -0.15) return { text: "Negative", className: "text-red-400" };
  return { text: "Neutral", className: "text-gray-400" };
}

export default function BuzzPage() {
  const [player, setPlayer] = useState("");
  const [result, setResult] = useState<BuzzResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!player.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ player: player.trim() });
        const res = await fetch(`/api/buzz?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setResult(json as BuzzResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load buzz");
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [player]
  );

  const overall = result ? sentimentLabel(result.averageSentiment) : null;

  return (
    <main className="min-h-screen bg-roobet-dark">
      <header className="border-b border-roobet-border bg-roobet-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-white font-bold text-lg">Player Social Buzz</h1>
          <SiteNav active="/buzz" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-gray-400 text-sm mb-6">
          Pulls recent Reddit mentions for a player (last month) and scores sentiment with a
          simple keyword lexicon. Twitter/X and Instagram are intentionally excluded — their
          terms of service prohibit automated scraping, and their official APIs require a paid
          tier this app doesn&apos;t assume you have.
        </p>

        <form
          onSubmit={runSearch}
          className="bg-roobet-card border border-roobet-border rounded-2xl p-6 mb-8 card-glow flex gap-4 flex-wrap"
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-gray-500 text-xs uppercase tracking-widest">Player name</label>
            <input
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder="e.g. Anthony Edwards"
              className="bg-roobet-dark border border-roobet-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-roobet-gold"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !player.trim()}
            className="self-end bg-roobet-gold text-roobet-dark font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-95 disabled:opacity-50 transition"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {result && (
          <>
            <div className="bg-roobet-card border border-roobet-border rounded-2xl p-6 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Mentions" value={String(result.mentionCount)} />
              <Stat
                label="Overall Sentiment"
                value={overall?.text ?? "—"}
                valueClassName={overall?.className}
              />
              <Stat label="Positive" value={String(result.positiveMentions)} valueClassName="text-roobet-green" />
              <Stat label="Negative" value={String(result.negativeMentions)} valueClassName="text-red-400" />
            </div>

            {result.topMentions.length === 0 ? (
              <p className="text-gray-400 text-center py-12">No recent mentions found.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {result.topMentions.map((m) => {
                  const label = sentimentLabel(m.sentiment);
                  return (
                    <a
                      key={m.id}
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-roobet-card border border-roobet-border rounded-xl p-4 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-white font-medium">{m.title}</p>
                          <p className="text-gray-600 text-xs mt-1">
                            r/{m.subreddit} · u/{m.author} · {m.score} upvotes · {m.numComments} comments
                          </p>
                        </div>
                        <span className={`text-xs font-bold whitespace-nowrap ${label.className}`}>
                          {label.text}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-roobet-border py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-gray-600 text-xs">
          <p>Not affiliated with Reddit. Sentiment scoring is a simple heuristic, not a professional analysis.</p>
        </div>
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  valueClassName = "text-white",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-gray-500 text-xs uppercase tracking-widest">{label}</p>
      <p className={`font-bold text-lg mt-0.5 ${valueClassName}`}>{value}</p>
    </div>
  );
}
