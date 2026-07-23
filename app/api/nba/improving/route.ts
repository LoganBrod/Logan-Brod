import { NextResponse } from "next/server";
import { getPlayerTrend } from "@/lib/nba";
import { getMarketComp, type CompSource } from "@/lib/comps";

export interface ImprovingPlayer {
  playerId: number;
  name: string;
  team: string | null;
  recentAvgPts: number;
  priorAvgPts: number;
  ptsDelta: number;
  recentGames: number;
  priorGames: number;
  marketPrice: number | null;
  marketSources: CompSource[];
}

const MAX_PLAYERS = 10;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const namesParam = searchParams.get("players")?.trim();

  if (!namesParam) {
    return NextResponse.json(
      { error: "Missing required query parameter: players (comma-separated NBA player names)" },
      { status: 400 }
    );
  }

  const names = namesParam
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, MAX_PLAYERS);

  try {
    const results: ImprovingPlayer[] = [];

    for (const name of names) {
      const trend = await getPlayerTrend(name).catch(() => null);
      if (!trend) continue;

      const comp = await getMarketComp(`${name} card`).catch(() => null);

      results.push({
        playerId: trend.playerId,
        name: trend.name,
        team: trend.team,
        recentAvgPts: trend.recentAvgPts,
        priorAvgPts: trend.priorAvgPts,
        ptsDelta: trend.recentAvgPts - trend.priorAvgPts,
        recentGames: trend.recentGames,
        priorGames: trend.priorGames,
        marketPrice: comp?.averagePrice ?? null,
        marketSources: comp?.sources ?? [],
      });
    }

    results.sort((a, b) => b.ptsDelta - a.ptsDelta);

    return NextResponse.json({ players: results }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
