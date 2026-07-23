"use client";

import { useCallback, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import PageHeader from "../components/PageHeader";
import Badge, { type BadgeTone } from "../components/Badge";
import Ticker from "../components/Ticker";
import type { ImprovingPlayer } from "../api/nba/improving/route";

const DEFAULT_PLAYERS = "Anthony Edwards, Cade Cunningham, Alperen Sengun, Franz Wagner";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function trendBadge(delta: number): { label: string; tone: BadgeTone } {
  if (delta >= 5) return { label: "Breakout", tone: "gold" };
  if (delta > 0) return { label: "Improving", tone: "positive" };
  if (delta < 0) return { label: "Cooling", tone: "negative" };
  return { label: "Flat", tone: "neutral" };
}

export default function NbaPage() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [results, setResults] = useState<ImprovingPlayer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!players.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ players: players.trim() });
        const res = await fetch(`/api/nba/improving?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setResults((json.players as ImprovingPlayer[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trends");
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [players]
  );

  const tickerItems = useMemo(() => {
    if (!results || results.length === 0) {
      return DEFAULT_PLAYERS.split(",").map((name) => ({
        label: name.trim().toUpperCase(),
        value: "—",
        tone: "neutral" as const,
      }));
    }
    return results.map((p) => ({
      label: p.name.toUpperCase(),
      value: `${p.ptsDelta > 0 ? "+" : ""}${fmt(p.ptsDelta)} PPG`,
      tone: p.ptsDelta > 0 ? ("positive" as const) : p.ptsDelta < 0 ? ("negative" as const) : ("neutral" as const),
    }));
  }, [results]);

  return (
    <div className="flex">
      <Sidebar active="/nba" />

      <main className="flex-1 min-w-0">
        <Ticker items={tickerItems} />

        <div className="max-w-5xl mx-auto px-6 py-10">
          <PageHeader
            eyebrow="Performance vs Market"
            title="NBA Improving Players"
            subtitle="Compares each player's last 10 games PPG to their season average (via balldontlie), alongside a snapshot card market price. This is a performance trend next to a current price, not a tracked card-price history."
          />

          <form
            onSubmit={runSearch}
            className="bg-ink-card border border-ink-border rounded-2xl p-6 mb-8 card-glow flex gap-4 flex-wrap"
          >
            <div className="flex flex-col gap-1 flex-1 min-w-[260px]">
              <label className="text-gray-500 text-xs uppercase tracking-widest">
                Player names (comma-separated, max 10)
              </label>
              <input
                value={players}
                onChange={(e) => setPlayers(e.target.value)}
                className="bg-ink-bg border border-ink-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ink-gold"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !players.trim()}
              className="self-end bg-ink-gold text-ink-bg font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-95 disabled:opacity-50 transition"
            >
              {loading ? "Loading…" : "Compare"}
            </button>
          </form>

          {error && (
            <div className="bg-red-900/20 border border-ink-red rounded-xl p-4 text-ink-red text-sm mb-6">
              {error}
            </div>
          )}

          {results && (
            results.length === 0 ? (
              <p className="text-gray-500 text-center py-12">
                No stats found for those players. Check spelling or try current-roster NBA players.
              </p>
            ) : (
              <div className="bg-ink-card border border-ink-border rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ink-border">
                      <Th>Player</Th>
                      <Th align="right">Last 10 PPG</Th>
                      <Th align="right">Season PPG</Th>
                      <Th align="right">Δ PPG</Th>
                      <Th align="right">Card Market Price</Th>
                      <Th align="right">Signal</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((p, i) => {
                      const badge = trendBadge(p.ptsDelta);
                      return (
                        <tr
                          key={p.playerId}
                          className={`border-b border-ink-border/60 last:border-0 ${
                            i % 2 === 0 ? "" : "bg-white/[0.02]"
                          }`}
                        >
                          <td className="px-4 py-4">
                            <p className="text-white font-medium">{p.name}</p>
                            {p.team && <p className="text-gray-600 text-xs mt-0.5">{p.team}</p>}
                          </td>
                          <td className="px-4 py-4 text-right text-white tabular-nums">
                            {fmt(p.recentAvgPts)}
                          </td>
                          <td className="px-4 py-4 text-right text-gray-400 tabular-nums">
                            {fmt(p.priorAvgPts)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span
                              className={`font-bold tabular-nums ${
                                p.ptsDelta > 0 ? "text-ink-green" : p.ptsDelta < 0 ? "text-ink-red" : "text-gray-400"
                              }`}
                            >
                              {p.ptsDelta > 0 ? "+" : ""}
                              {fmt(p.ptsDelta)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-ink-gold tabular-nums">
                            {p.marketPrice != null ? `$${fmt(p.marketPrice)}` : "—"}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Badge label={badge.label} tone={badge.tone} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        <footer className="border-t border-ink-border py-6 mt-12">
          <div className="max-w-5xl mx-auto px-6 text-center text-gray-600 text-xs">
            <p>Not affiliated with the NBA or balldontlie. Informational only, not investment advice.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-4 py-3 ${
        align === "right" ? "text-right" : "text-left"
      } text-gray-500 text-xs uppercase tracking-widest font-medium`}
    >
      {children}
    </th>
  );
}
