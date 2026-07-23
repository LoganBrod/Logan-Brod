"use client";

import { useCallback, useState } from "react";
import SiteNav from "../components/SiteNav";
import type { ImprovingPlayer } from "../api/nba/improving/route";

const DEFAULT_PLAYERS = "Anthony Edwards, Cade Cunningham, Alperen Sengun, Franz Wagner";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

  return (
    <main className="min-h-screen bg-roobet-dark">
      <header className="border-b border-roobet-border bg-roobet-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-white font-bold text-lg">NBA Improving Players vs Market</h1>
          <SiteNav active="/nba" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-gray-400 text-sm mb-6">
          Compares each player&apos;s last 10 games PPG to their prior season average
          (via balldontlie), alongside a snapshot market price for their trading cards. This
          shows a performance trend next to a current price — it does not track card-price
          history over time, since that would require a database this app doesn&apos;t have.
        </p>

        <form
          onSubmit={runSearch}
          className="bg-roobet-card border border-roobet-border rounded-2xl p-6 mb-8 card-glow flex gap-4 flex-wrap"
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[260px]">
            <label className="text-gray-500 text-xs uppercase tracking-widest">
              Player names (comma-separated, max 10)
            </label>
            <input
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
              className="bg-roobet-dark border border-roobet-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-roobet-gold"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !players.trim()}
            className="self-end bg-roobet-gold text-roobet-dark font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-95 disabled:opacity-50 transition"
          >
            {loading ? "Loading…" : "Compare"}
          </button>
        </form>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {results && (
          results.length === 0 ? (
            <p className="text-gray-400 text-center py-12">
              No stats found for those players. Check spelling or try current-roster NBA players.
            </p>
          ) : (
            <div className="bg-roobet-card border border-roobet-border rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-roobet-border">
                    <Th>Player</Th>
                    <Th align="right">Last 10 PPG</Th>
                    <Th align="right">Season PPG</Th>
                    <Th align="right">Δ PPG</Th>
                    <Th align="right">Card Market Price</Th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((p, i) => (
                    <tr
                      key={p.playerId}
                      className={`border-b border-roobet-border/50 last:border-0 ${
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
                            p.ptsDelta > 0 ? "text-roobet-green" : p.ptsDelta < 0 ? "text-red-400" : "text-gray-400"
                          }`}
                        >
                          {p.ptsDelta > 0 ? "+" : ""}
                          {fmt(p.ptsDelta)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-roobet-gold tabular-nums">
                        {p.marketPrice != null ? `$${fmt(p.marketPrice)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <footer className="border-t border-roobet-border py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-gray-600 text-xs">
          <p>Not affiliated with the NBA or balldontlie. Informational only, not investment advice.</p>
        </div>
      </footer>
    </main>
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
