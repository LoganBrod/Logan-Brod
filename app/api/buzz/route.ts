import { NextResponse } from "next/server";
import { searchRedditMentions } from "@/lib/reddit";
import { scoreSentiment } from "@/lib/sentiment";

export interface BuzzMention {
  id: string;
  title: string;
  url: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  createdAt: string;
  sentiment: number;
}

export interface BuzzResult {
  player: string;
  mentionCount: number;
  averageSentiment: number;
  positiveMentions: number;
  negativeMentions: number;
  neutralMentions: number;
  topMentions: BuzzMention[];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const player = searchParams.get("player")?.trim();

  if (!player) {
    return NextResponse.json({ error: "Missing required query parameter: player" }, { status: 400 });
  }

  try {
    const mentions = await searchRedditMentions(`"${player}"`, 50);

    const scored: BuzzMention[] = mentions.map((m) => {
      const { score } = scoreSentiment(`${m.title} ${m.body}`);
      return {
        id: m.id,
        title: m.title,
        url: m.url,
        subreddit: m.subreddit,
        author: m.author,
        score: m.score,
        numComments: m.numComments,
        createdAt: m.createdAt,
        sentiment: score,
      };
    });

    const positiveMentions = scored.filter((m) => m.sentiment > 0.15).length;
    const negativeMentions = scored.filter((m) => m.sentiment < -0.15).length;
    const neutralMentions = scored.length - positiveMentions - negativeMentions;
    const averageSentiment = scored.length
      ? scored.reduce((sum, m) => sum + m.sentiment, 0) / scored.length
      : 0;

    const topMentions = [...scored]
      .sort((a, b) => b.score + b.numComments - (a.score + a.numComments))
      .slice(0, 15);

    const result: BuzzResult = {
      player,
      mentionCount: scored.length,
      averageSentiment,
      positiveMentions,
      negativeMentions,
      neutralMentions,
      topMentions,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
