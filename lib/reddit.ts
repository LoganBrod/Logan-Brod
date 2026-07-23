// Reddit search client — official API (OAuth client-credentials when REDDIT_CLIENT_ID /
// REDDIT_CLIENT_SECRET are set, falling back to the public read-only search.json endpoint
// otherwise). This is used instead of scraping X/Instagram, which forbid automated access
// in their terms of service.

const USER_AGENT = "logan-brod-social-buzz/1.0";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getRedditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });

  if (!res.ok) return null;

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export interface SocialMention {
  id: string;
  title: string;
  body: string;
  url: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  createdAt: string;
}

interface RedditChild {
  data: {
    id: string;
    title?: string;
    selftext?: string;
    permalink: string;
    subreddit: string;
    author: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
  };
}

export type RedditTimeWindow = "hour" | "day" | "week" | "month" | "year";

export async function searchRedditMentions(
  query: string,
  limit = 50,
  time: RedditTimeWindow = "month"
): Promise<SocialMention[]> {
  const token = await getRedditToken();
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (token) headers.Authorization = `Bearer ${token}`;

  const params = new URLSearchParams({
    q: query,
    sort: "new",
    limit: String(limit),
    t: time,
  });

  const res = await fetch(`${base}/search.json?${params.toString()}`, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Reddit search failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { data?: { children?: RedditChild[] } };
  const children = json.data?.children ?? [];

  return children.map((c): SocialMention => {
    const d = c.data;
    return {
      id: d.id,
      title: d.title ?? "",
      body: d.selftext ?? "",
      url: `https://reddit.com${d.permalink}`,
      subreddit: d.subreddit,
      author: d.author,
      score: d.score ?? 0,
      numComments: d.num_comments ?? 0,
      createdAt: new Date((d.created_utc ?? 0) * 1000).toISOString(),
    };
  });
}
