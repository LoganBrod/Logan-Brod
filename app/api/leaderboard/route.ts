import { NextResponse } from "next/server";

const ROOBET_API_TOKEN =
  process.env.ROOBET_API_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjQ1YWI5MDdjLThmYmUtNGZiOS1iN2NhLWYyYzUxMTNhMmEyYiIsIm5vbmNlIjoiNDQ0Y2FlMzgtYjQ5Zi00OTI4LTg5ZjktMjRkYmUyOTljMzdiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzgxNjMxMzkxfQ.dKtS_q6jckxezPbMoqFLhXWYnnB0Zet_p-qIfx5LMpA";

const CONTEST_END = new Date("2026-07-16T23:59:59Z");

export interface LeaderboardEntry {
  rank: number;
  username: string;
  userId?: string;
  totalWager: number;
  prize?: string;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  contestEnd: string;
  lastUpdated: string;
  totalWagered: number;
}

async function fetchRoobetStats(): Promise<LeaderboardEntry[]> {
  const headers = {
    Authorization: `Bearer ${ROOBET_API_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Try the affiliate referrals endpoint to get per-user wagering data
  const res = await fetch("https://api.roobet.com/affiliate/referrals", {
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Roobet API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // Normalise the response — Roobet may return an array or a wrapped object
  let referrals: Array<Record<string, unknown>> = [];
  if (Array.isArray(data)) {
    referrals = data;
  } else if (Array.isArray(data?.data)) {
    referrals = data.data;
  } else if (Array.isArray(data?.referrals)) {
    referrals = data.referrals;
  } else if (Array.isArray(data?.users)) {
    referrals = data.users;
  }

  const entries: LeaderboardEntry[] = referrals
    .map((r) => {
      const wager =
        Number(r.totalWager ?? r.wagerAmount ?? r.wagered ?? r.total_wager ?? 0);
      const username =
        String(r.username ?? r.name ?? r.user ?? r.userId ?? r.id ?? "Unknown");
      const userId = r.userId ? String(r.userId) : r.id ? String(r.id) : undefined;
      return { rank: 0, username, userId, totalWager: wager };
    })
    .filter((e) => e.totalWager > 0)
    .sort((a, b) => b.totalWager - a.totalWager)
    .slice(0, 50)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return entries;
}

export async function GET() {
  try {
    const entries = await fetchRoobetStats();

    const totalWagered = entries.reduce((sum, e) => sum + e.totalWager, 0);

    const response: LeaderboardData = {
      entries,
      contestEnd: CONTEST_END.toISOString(),
      lastUpdated: new Date().toISOString(),
      totalWagered,
    };

    return NextResponse.json(response, {
      headers: {
        // Cache for 5 minutes on the CDN, stale-while-revalidate for 1 minute
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[leaderboard] fetch failed:", message);
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
