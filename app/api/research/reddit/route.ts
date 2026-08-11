import { NextResponse } from "next/server";
import {
  getSubredditAbout,
  isValidSubredditName,
  searchSubreddit,
  type RedditSearchSort,
  type RedditTimeWindow,
  type SubredditHealth,
} from "@/lib/reddit";

// Read-only community-research proxy.
//
// Reddit blocks unauthenticated reads from datacenter IPs, so an agent running
// outside this app cannot reach reddit.com at all — WebSearch returns no
// reddit.com results and a direct fetch gets HTTP 403. This route exists so such
// an agent can borrow this app's already-configured OAuth credentials instead of
// carrying a copy of them. It returns nothing that is not publicly visible on
// Reddit to a logged-out human.
//
// It is deliberately narrow: an allowlist of subreddits, a hard result cap, and
// no write path of any kind, so it cannot be repurposed as a general Reddit
// proxy. Set RESEARCH_API_TOKEN to additionally require a bearer token.

const ALLOWED_SUBREDDITS = [
  "malefashionadvice",
  "streetwear",
  "frugalmalefashion",
  "mensfashion",
  "mensstyle",
  "navyblazer",
  "rawdenim",
  "goodyearwelt",
  "findfashion",
  "sneakers",
];

const MAX_SUBREDDITS = 5;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 15;

const TIME_WINDOWS: RedditTimeWindow[] = ["hour", "day", "week", "month", "year"];
const SORTS: RedditSearchSort[] = ["relevance", "new", "top", "comments"];

interface CommunityResult extends SubredditHealth {
  matchCount: number;
  matches: {
    title: string;
    url: string;
    author: string;
    score: number;
    numComments: number;
    createdAt: string;
    excerpt: string;
  }[];
  error: string | null;
}

// Self-text can run to thousands of words; the caller only needs enough to judge
// whether a thread is worth reading in full.
function excerpt(body: string, max = 600): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export async function GET(req: Request) {
  const requiredToken = process.env.RESEARCH_API_TOKEN;
  if (requiredToken) {
    const provided = req.headers.get("authorization");
    if (provided !== `Bearer ${requiredToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);

  const query = searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400 }
    );
  }

  const rawSubs = (searchParams.get("subs") ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^\/?r\//i, "").toLowerCase())
    .filter(Boolean);

  if (rawSubs.length === 0) {
    return NextResponse.json(
      {
        error: "Missing required query parameter: subs",
        allowedSubreddits: ALLOWED_SUBREDDITS.slice().sort(),
      },
      { status: 400 }
    );
  }

  const subs = rawSubs.filter((s, i) => rawSubs.indexOf(s) === i);

  if (subs.length > MAX_SUBREDDITS) {
    return NextResponse.json(
      { error: `Too many subreddits requested (max ${MAX_SUBREDDITS}).` },
      { status: 400 }
    );
  }

  const rejected = subs.filter(
    (s) => !isValidSubredditName(s) || ALLOWED_SUBREDDITS.indexOf(s) === -1
  );
  if (rejected.length > 0) {
    return NextResponse.json(
      {
        error: `Subreddit(s) not on the allowlist: ${rejected.join(", ")}`,
        allowedSubreddits: ALLOWED_SUBREDDITS.slice().sort(),
      },
      { status: 400 }
    );
  }

  const timeParam = searchParams.get("t") as RedditTimeWindow | null;
  const time: RedditTimeWindow =
    timeParam && TIME_WINDOWS.includes(timeParam) ? timeParam : "week";

  const sortParam = searchParams.get("sort") as RedditSearchSort | null;
  const sort: RedditSearchSort =
    sortParam && SORTS.includes(sortParam) ? sortParam : "relevance";

  const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isNaN(parsedLimit)
    ? DEFAULT_LIMIT
    : Math.min(Math.max(parsedLimit, 1), MAX_LIMIT);

  // One failing subreddit must not sink the others: a locked or renamed
  // community is exactly the kind of thing the caller needs reported per-sub
  // rather than as a single opaque 502.
  const communities: CommunityResult[] = await Promise.all(
    subs.map(async (subreddit): Promise<CommunityResult> => {
      const base: CommunityResult = {
        subreddit,
        exists: false,
        subscribers: null,
        activeUsers: null,
        type: null,
        postingRestricted: false,
        note: null,
        matchCount: 0,
        matches: [],
        error: null,
      };

      let health: SubredditHealth;
      try {
        health = await getSubredditAbout(subreddit);
      } catch (err) {
        return {
          ...base,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }

      if (!health.exists) {
        return { ...base, ...health, matchCount: 0, matches: [], error: null };
      }

      try {
        const mentions = await searchSubreddit(subreddit, query, limit, time, sort);
        return {
          ...base,
          ...health,
          matchCount: mentions.length,
          matches: mentions.map((m) => ({
            title: m.title,
            url: m.url,
            author: m.author,
            score: m.score,
            numComments: m.numComments,
            createdAt: m.createdAt,
            excerpt: excerpt(m.body),
          })),
          error: null,
        };
      } catch (err) {
        return {
          ...base,
          ...health,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    })
  );

  const totalMatches = communities.reduce((sum, c) => sum + c.matchCount, 0);
  const credentialed = Boolean(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
  );

  const warnings: string[] = [];
  if (!credentialed) {
    warnings.push(
      "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are not set on the server, so this " +
        "request used Reddit's unauthenticated endpoint. That path is blocked from " +
        "most hosting IPs — empty results here are probably an access failure, not " +
        "an absence of discussion."
    );
  }
  for (const c of communities) {
    if (c.error) warnings.push(`r/${c.subreddit}: ${c.error}`);
    else if (!c.exists) warnings.push(`r/${c.subreddit}: not found.`);
    else if (c.postingRestricted) warnings.push(`r/${c.subreddit}: ${c.note}`);
  }

  return NextResponse.json(
    {
      query,
      timeWindow: time,
      sort,
      limitPerSubreddit: limit,
      credentialed,
      totalMatches,
      communities,
      warnings,
    },
    {
      // Weekly caller, cheap to serve, but cache enough that a retry loop cannot
      // chew through the Reddit rate limit.
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300" },
    }
  );
}
