"use client";

import { useCallback, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import PageHeader from "../components/PageHeader";
import StatPanel from "../components/StatPanel";
import Badge, { type BadgeTone } from "../components/Badge";
import Ticker from "../components/Ticker";
import type { BuzzResult } from "../api/buzz/route";

function sentimentBadge(score: number): { label: string; tone: BadgeTone } {
  if (score > 0.15) return { label: "Positive", tone: "positive" };
  if (score < -0.15) return { label: "Negative", tone: "negative" };
  return { label: "Neutral", tone: "neutral" };
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

  const overall = result ? sentimentBadge(result.averageSentiment) : null;

  const tickerItems = useMemo(() => {
    if (!result || result.topMentions.length === 0) {
      return [
        { label: "TRY", value: "ANTHONY EDWARDS", tone: "neutral" as const },
        { label: "TRY", value: "VICTOR WEMBANYAMA", tone: "neutral" as const },
      ];
    }
    return result.topMentions.slice(0, 8).map((m) => ({
      label: `r/${m.subreddit}`,
      value: sentimentBadge(m.sentiment).label.toUpperCase(),
      tone:
        m.sentiment > 0.15 ? ("positive" as const) : m.sentiment < -0.15 ? ("negative" as const) : ("neutral" as const),
    }));
  }, [result]);

  return (
    <div className="flex">
      <Sidebar active="/buzz" />

      <main className="flex-1 min-w-0">
        <Ticker items={tickerItems} />

        <div className="max-w-5xl mx-auto px-6 py-10">
          <PageHeader
            eyebrow="Social Signal"
            title="Player Social Buzz"
            subtitle="Recent Reddit mentions for a player, scored with a keyword sentiment lexicon. Twitter/X and Instagram are excluded — automated access violates their terms of service."
          />

          <form
            onSubmit={runSearch}
            className="bg-ink-card border border-ink-border rounded-2xl p-6 mb-8 card-glow flex gap-4 flex-wrap"
          >
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-gray-500 text-xs uppercase tracking-widest">Player name</label>
              <input
                value={player}
                onChange={(e) => setPlayer(e.target.value)}
                placeholder="e.g. Anthony Edwards"
                className="bg-ink-bg border border-ink-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ink-gold"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !player.trim()}
              className="self-end bg-ink-gold text-ink-bg font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-95 disabled:opacity-50 transition"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          {error && (
            <div className="bg-red-900/20 border border-ink-red rounded-xl p-4 text-ink-red text-sm mb-6">
              {error}
            </div>
          )}

          {result && (
            <>
              <StatPanel
                items={[
                  { label: "Mentions", value: String(result.mentionCount) },
                  {
                    label: "Overall Sentiment",
                    value: overall?.label ?? "—",
                    deltaTone:
                      overall?.tone === "positive" ? "positive" : overall?.tone === "negative" ? "negative" : "neutral",
                  },
                  { label: "Positive", value: String(result.positiveMentions), deltaTone: "positive" },
                  { label: "Negative", value: String(result.negativeMentions), deltaTone: "negative" },
                ]}
              />

              {result.topMentions.length === 0 ? (
                <p className="text-gray-500 text-center py-12">No recent mentions found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {result.topMentions.map((m) => {
                    const badge = sentimentBadge(m.sentiment);
                    return (
                      <a
                        key={m.id}
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-ink-card border border-ink-border rounded-xl p-4 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-white font-medium">{m.title}</p>
                            <p className="text-gray-600 text-xs mt-1">
                              r/{m.subreddit} · u/{m.author} · {m.score} upvotes · {m.numComments} comments
                            </p>
                          </div>
                          <Badge label={badge.label} tone={badge.tone} />
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="border-t border-ink-border py-6 mt-12">
          <div className="max-w-5xl mx-auto px-6 text-center text-gray-600 text-xs">
            <p>Not affiliated with Reddit. Sentiment scoring is a simple heuristic, not a professional analysis.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
