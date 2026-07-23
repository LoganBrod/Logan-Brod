// balldontlie.io NBA stats client — used to detect players trending up over their last
// games compared to the rest of the season. Requires BALLDONTLIE_API_KEY (free signup at
// balldontlie.io); the free tier is rate-limited (a handful of requests/minute), so callers
// should look up a small, explicit list of player names rather than crawling the full league.

const BALLDONTLIE_BASE = "https://api.balldontlie.io/v1";

function authHeaders(): Record<string, string> {
  const key = process.env.BALLDONTLIE_API_KEY;
  return key ? { Authorization: key } : {};
}

interface BdlPlayer {
  id: number;
  first_name: string;
  last_name: string;
  team?: { full_name?: string };
}

async function findPlayer(name: string): Promise<BdlPlayer | null> {
  const params = new URLSearchParams({ search: name, per_page: "5" });
  const res = await fetch(`${BALLDONTLIE_BASE}/players?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`balldontlie /players failed: HTTP ${res.status}`);
  const json = (await res.json()) as { data?: BdlPlayer[] };
  return json.data?.[0] ?? null;
}

interface BdlStat {
  pts: number;
  game: { date: string };
}

async function getSeasonStats(playerId: number, season: number): Promise<BdlStat[]> {
  const params = new URLSearchParams({
    "player_ids[]": String(playerId),
    "seasons[]": String(season),
    per_page: "100",
  });
  const res = await fetch(`${BALLDONTLIE_BASE}/stats?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`balldontlie /stats failed: HTTP ${res.status}`);
  const json = (await res.json()) as { data?: BdlStat[] };
  return json.data ?? [];
}

export interface PlayerTrend {
  playerId: number;
  name: string;
  team: string | null;
  recentAvgPts: number;
  priorAvgPts: number;
  recentGames: number;
  priorGames: number;
}

const RECENT_WINDOW = 10;

function currentSeasonStartYear(): number {
  const now = new Date();
  // NBA seasons start in October; before that, "this season" is still last year's.
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

export async function getPlayerTrend(name: string): Promise<PlayerTrend | null> {
  const player = await findPlayer(name);
  if (!player) return null;

  const stats = await getSeasonStats(player.id, currentSeasonStartYear());
  const sorted = stats
    .filter((s) => s.game?.date)
    .sort((a, b) => new Date(b.game.date).getTime() - new Date(a.game.date).getTime());

  if (sorted.length < 4) return null;

  const recent = sorted.slice(0, RECENT_WINDOW);
  const prior = sorted.slice(RECENT_WINDOW);
  const priorOrFallback = prior.length ? prior : recent;

  const avg = (arr: BdlStat[]) =>
    arr.length ? arr.reduce((sum, s) => sum + (s.pts ?? 0), 0) / arr.length : 0;

  return {
    playerId: player.id,
    name: `${player.first_name} ${player.last_name}`,
    team: player.team?.full_name ?? null,
    recentAvgPts: avg(recent),
    priorAvgPts: avg(priorOrFallback),
    recentGames: recent.length,
    priorGames: prior.length,
  };
}
