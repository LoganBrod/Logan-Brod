import { NextResponse } from "next/server";

const TOKEN =
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

// Every combination of (base URL) x (path) x (auth style) to try
const ATTEMPTS: Array<{ url: string; headers: Record<string, string> }> = [];

const BASES = [
  "https://api.roobet.com",
  "https://affiliates.roobet.com",
  "https://affiliate.roobet.com",
];

const PATHS = [
  "/affiliate/referrals",
  "/affiliate/wagers",
  "/affiliate/stats",
  "/affiliate/users",
  "/affiliate/commission",
  "/affiliate",
  "/affiliateStats/referrals",
  "/affiliateStats",
  "/api/affiliate/referrals",
  "/api/affiliate/stats",
];

const AUTH_VARIANTS: Array<Record<string, string>> = [
  { Authorization: `Bearer ${TOKEN}` },
  { Authorization: `JWT ${TOKEN}` },
  { Authorization: TOKEN },
  { "x-api-key": TOKEN },
  { token: TOKEN },
];

// Build attempt list: try Bearer auth on all URL combos first, then other auth styles
for (const auth of AUTH_VARIANTS) {
  for (const base of BASES) {
    for (const path of PATHS) {
      ATTEMPTS.push({
        url: `${base}${path}`,
        headers: { ...auth, Accept: "application/json" },
      });
    }
  }
}

// Also try token as query param
for (const base of BASES) {
  for (const path of PATHS) {
    ATTEMPTS.push({
      url: `${base}${path}?token=${TOKEN}`,
      headers: { Accept: "application/json" },
    });
  }
}

function normalise(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const key of [
      "referrals", "users", "data", "wagers", "stats",
      "items", "results", "leaderboard", "players",
    ]) {
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
    : r.user_id ? String(r.user_id)
    : r.id ? String(r.id)
    : undefined;
  return { rank: 0, username, userId, totalWager: wager };
}

async function fetchRoobetStats(): Promise<{ entries: LeaderboardEntry[]; endpoint: string }> {
  // Track unique status codes per URL to keep the error summary compact
  const errors = new Map<string, string>();

  for (const { url, headers } of ATTEMPTS) {
    let res: Response;
    try {
      res = await fetch(url, { headers, cache: "no-store" });
    } catch (e) {
      errors.set(url, `network: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    if (!res.ok) {
      errors.set(url, `HTTP ${res.status}`);
      continue;
    }

    let data: unknown;
    try { data = await res.json(); } catch {
      errors.set(url, "invalid JSON");
      continue;
    }

    const rows = normalise(data);
    const entries = rows
      .map(toEntry)
      .filter((e) => e.totalWager > 0)
      .sort((a, b) => b.totalWager - a.totalWager)
      .slice(0, 50)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    console.log(`[leaderboard] success: ${url} — ${entries.length} entries`);
    return { entries, endpoint: url };
  }

  const summary = Array.from(errors.entries())
    .map(([url, err]) => `${url} → ${err}`)
    .join("\n");
  throw new Error(`All Roobet endpoints failed:\n${summary}`);
}

export async function GET() {
  try {
    const { entries, endpoint } = await fetchRoobetStats();
    const totalWagered = entries.reduce((sum, e) => sum + e.totalWager, 0);

    return NextResponse.json(
      {
        entries,
        contestEnd: CONTEST_END.toISOString(),
        lastUpdated: new Date().toISOString(),
        totalWagered,
        endpoint,
      } satisfies LeaderboardData,
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[leaderboard]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
