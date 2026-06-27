import { NextResponse } from "next/server";

const TOKEN =
  process.env.ROOBET_API_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjQ1YWI5MDdjLThmYmUtNGZiOS1iN2NhLWYyYzUxMTNhMmEyYiIsIm5vbmNlIjoiNDQ0Y2FlMzgtYjQ5Zi00OTI4LTg5ZjktMjRkYmUyOTljMzdiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzgxNjMxMzkxfQ.dKtS_q6jckxezPbMoqFLhXWYnnB0Zet_p-qIfx5LMpA";

// Set CLOUDFLARE_PROXY_URL in Vercel env vars to your Worker URL, e.g.:
//   https://roobet-proxy.YOUR-SUBDOMAIN.workers.dev
const PROXY_BASE = process.env.CLOUDFLARE_PROXY_URL ?? "";

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

// Paths to try in order — used against whichever base is available
const PATHS = [
  "/affiliate/referrals",
  "/affiliate/wagers",
  "/affiliate/stats",
  "/affiliate/users",
  "/affiliate/commission",
  "/affiliate",
  "/affiliateStats/referrals",
  "/affiliateStats",
];

// Build attempt list: Cloudflare proxy first (if configured), then direct as fallback
function buildAttempts(): Array<{ url: string; headers: Record<string, string> }> {
  const attempts: Array<{ url: string; headers: Record<string, string> }> = [];

  // Via Cloudflare Worker (token is injected by the Worker, not sent here)
  if (PROXY_BASE) {
    for (const path of PATHS) {
      attempts.push({ url: `${PROXY_BASE}${path}`, headers: { Accept: "application/json" } });
    }
  }

  // Direct fallback — in case Cloudflare isn't set up yet
  for (const path of PATHS) {
    attempts.push({
      url: `https://api.roobet.com${path}`,
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    });
  }

  return attempts;
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
  const userId = r.userId ? String(r.userId)
    : r.user_id ? String(r.user_id)
    : r.id ? String(r.id)
    : undefined;
  return { rank: 0, username, userId, totalWager: wager };
}

async function fetchRoobetStats(): Promise<{ entries: LeaderboardEntry[]; endpoint: string }> {
  const errors: string[] = [];

  for (const { url, headers } of buildAttempts()) {
    let res: Response;
    try {
      res = await fetch(url, { headers, cache: "no-store" });
    } catch (e) {
      errors.push(`${url} → network: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    if (!res.ok) {
      errors.push(`${url} → HTTP ${res.status}`);
      continue;
    }

    let data: unknown;
    try { data = await res.json(); } catch {
      errors.push(`${url} → invalid JSON`);
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

  throw new Error(`All endpoints failed:\n${errors.join("\n")}`);
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
