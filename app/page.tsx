"use client";

import { useEffect, useState, useCallback } from "react";
import type { LeaderboardData, LeaderboardEntry } from "./api/leaderboard/route";
import Countdown from "./components/Countdown";
import TopThree from "./components/TopThree";
import LeaderboardTable from "./components/LeaderboardTable";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function Home() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const json: LeaderboardData = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const top3 = data?.entries.slice(0, 3) ?? [];
  const rest = data?.entries.slice(3) ?? [];

  return (
    <main className="min-h-screen bg-roobet-dark">
      {/* Header */}
      <header className="border-b border-roobet-border bg-roobet-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://roobet.com/favicon.ico"
              alt="Roobet"
              width={32}
              height={32}
              className="rounded"
            />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">
                Roobet Wager Leaderboard
              </h1>
              <p className="text-gray-400 text-xs">
                Use code{" "}
                <a
                  href="https://roobet.com/?ref=lmb1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-roobet-gold font-semibold hover:underline"
                >
                  lmb1
                </a>{" "}
                to participate
              </p>
            </div>
          </div>

          <div className="text-right">
            {lastRefresh && (
              <p className="text-gray-500 text-xs">
                Updated {lastRefresh.toLocaleTimeString()}
              </p>
            )}
            <button
              onClick={fetchLeaderboard}
              className="text-roobet-gold text-xs hover:underline mt-0.5"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Contest info banner */}
        <div className="bg-roobet-card border border-roobet-border rounded-2xl p-6 mb-8 card-glow">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-1">
                Active Contest
              </p>
              <h2 className="text-white text-2xl font-bold">
                All-Time Wager Competition
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Sign up with code{" "}
                <a
                  href="https://roobet.com/?ref=lmb1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-roobet-gold font-semibold hover:underline"
                >
                  lmb1
                </a>{" "}
                and wager to climb the ranks
              </p>
            </div>

            <div className="text-center md:text-right">
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">
                Time Remaining
              </p>
              {data?.contestEnd && <Countdown endDate={data.contestEnd} />}
            </div>
          </div>

          {data && (
            <div className="mt-6 pt-5 border-t border-roobet-border grid grid-cols-2 md:grid-cols-3 gap-4">
              <Stat label="Total Participants" value={data.entries.length.toString()} />
              <Stat
                label="Total Wagered"
                value={`$${data.totalWagered.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
              />
              <Stat
                label="Contest Ends"
                value={new Date(data.contestEnd).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                className="col-span-2 md:col-span-1"
              />
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-roobet-gold/30 border-t-roobet-gold rounded-full animate-spin" />
              <p className="text-gray-400">Loading leaderboard…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-6 text-center">
            <p className="text-red-400 font-semibold mb-1">Failed to load leaderboard</p>
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={fetchLeaderboard}
              className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {data.entries.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-gray-400 text-lg">No wager data yet.</p>
                <p className="text-gray-500 text-sm mt-2">
                  Be the first to wager using code{" "}
                  <span className="text-roobet-gold">lmb1</span>!
                </p>
              </div>
            ) : (
              <>
                {top3.length > 0 && <TopThree entries={top3} />}
                {rest.length > 0 && (
                  <LeaderboardTable entries={rest} startRank={4} />
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-roobet-border py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-gray-600 text-xs">
          <p>
            Not affiliated with Roobet. Leaderboard data sourced from the Roobet
            affiliate API. Gamble responsibly. 18+.
          </p>
        </div>
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-gray-500 text-xs uppercase tracking-widest">{label}</p>
      <p className="text-white font-bold text-lg mt-0.5">{value}</p>
    </div>
  );
}
