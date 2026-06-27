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
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  contestEnd: string;
  lastUpdated: string;
  totalWagered: number;
  endpoint?: string;
}

const BASE = "https://api.roobet.com";

// Candidate endpoints in priority order — the first 2xx response wins
const CANDIDATE_ENDPOINTS = [
  `${BASE}/affiliate/referrals`,
  `${BASE}/affiliate/wagers`,
  `${BASE}/affiliate/stats`,
  `${BASE}/affiliate/users`,
  `${BASE}/affiliate/commission`,
  `${BASE}/affiliate`,
];

function normalise(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const key of ["referrals", "users", "data", "wagers", "stats", "items", "results"]) {
      if (Array.isArray(d[key])) return d[key] as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function toEntry(r: Record<string, unknown>): LeaderboardEntry {
  const wager = Number(
    r.totalWager ?? r.wagerAmount ?? r.wagered ?? r.total_wager ??
    r.wager ?? r.amount ?? r.totalBet ?? r.total_bet ?? 0
  );
  const username = String(
    r.username ?? r.name ?? r.user ?? r.displayName ??
    r.display_name ?? r.userId ?? r.user_id ?? r.id ?? "Unknown"
  );
  const userId = r.userId
    ? String(r.userId)
    : r.user_id
    ? String(r.user_id)
    : r.id
    ? String(r.id)
    : undefined;
  return { rank: 0, username, userId, totalWager: wager };
}

async function fetchRoobetStats(): Promise<{ entries: LeaderboardEntry[]; endpoint: string }> {
  const headers = {
    Authorization: `Bearer ${ROOBET_API_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const errors: string[] = [];

  for (const endpoint of CANDIDATE_ENDPOINTS) {
    let res: Response;
    try {
      res = await fetch(endpoint, { headers, cache: "no-store" });
    } catch (e) {
      errors.push(`${endpoint} → network error: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    if (!res.ok) {
      errors.push(`${endpoint} → HTTP ${res.status}`);
      continue;
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      errors.push(`${endpoint} → invalid JSON`);
      continue;
    }

    const rows = normalise(data);
    const entries = rows
      .map(toEntry)
      .filter((e) => e.totalWager > 0)
      .sort((a, b) => b.totalWager - a.totalWager)
      .slice(0, 50)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    console.log(`[leaderboard] success via ${endpoint} — ${entries.length} entries`);
    return { entries, endpoint };
  }

  throw new Error(
    `All Roobet endpoints failed:\n${errors.join("\n")}`
  );
}

export async function GET() {
  try {
    const { entries, endpoint } = await fetchRoobetStats();
    const totalWagered = entries.reduce((sum, e) => sum + e.totalWager, 0);

    const response: LeaderboardData = {
      entries,
      contestEnd: CONTEST_END.toISOString(),
      lastUpdated: new Date().toISOString(),
      totalWagered,
      endpoint,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[leaderboard] all endpoints failed:\n", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
