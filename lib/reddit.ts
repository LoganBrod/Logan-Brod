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

// Reddit reads go to oauth.reddit.com when credentials are configured. The
// unauthenticated fallback host is heavily rate-limited and is blocked outright
// from most datacenter IPs, so anything running server-side in practice needs
// REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET to be set.
async function redditGet(path: string, params: URLSearchParams): Promise<Response> {
  const token = await getRedditToken();
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${base}${path}?${params.toString()}`, { headers, cache: "no-store" });
}

function toMention(c: RedditChild): SocialMention {
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
}

// Subreddit names are interpolated into a request path, so keep them to the
// character set Reddit actually allows.
export function isValidSubredditName(subreddit: string): boolean {
  return /^[A-Za-z0-9_]{2,21}$/.test(subreddit);
}

export async function searchRedditMentions(
  query: string,
  limit = 50,
  time: RedditTimeWindow = "month"
): Promise<SocialMention[]> {
  const params = new URLSearchParams({
    q: query,
    sort: "new",
    limit: String(limit),
    t: time,
  });

  const res = await redditGet("/search.json", params);
  if (!res.ok) {
    throw new Error(`Reddit search failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { data?: { children?: RedditChild[] } };
  return (json.data?.children ?? []).map(toMention);
}

export type RedditSearchSort = "relevance" | "new" | "top" | "comments";

// Search restricted to a single subreddit. searchRedditMentions() searches all
// of Reddit, which is right for "who is talking about this player" but wrong for
// "what is this specific community asking for".
export async function searchSubreddit(
  subreddit: string,
  query: string,
  limit = 25,
  time: RedditTimeWindow = "week",
  sort: RedditSearchSort = "relevance"
): Promise<SocialMention[]> {
  if (!isValidSubredditName(subreddit)) {
    throw new Error(`Invalid subreddit name: ${subreddit}`);
  }

  const params = new URLSearchParams({
    q: query,
    restrict_sr: "1",
    sort,
    limit: String(limit),
    t: time,
  });

  const res = await redditGet(`/r/${subreddit}/search.json`, params);
  if (!res.ok) {
    throw new Error(`Reddit subreddit search failed for r/${subreddit}: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { data?: { children?: RedditChild[] } };
  return (json.data?.children ?? []).map(toMention);
}

export interface SubredditHealth {
  subreddit: string;
  exists: boolean;
  subscribers: number | null;
  activeUsers: number | null;
  // "public" | "restricted" | "private" | "archived" | "gold_only" | ...
  type: string | null;
  // True when ordinary members cannot start new discussions — a subreddit can
  // still be readable while being effectively dead as a community.
  postingRestricted: boolean;
  note: string | null;
}

// Community health check. Used to tell "quiet week" apart from "this subreddit
// is locked or gone", which otherwise both look like zero results.
export async function getSubredditAbout(subreddit: string): Promise<SubredditHealth> {
  if (!isValidSubredditName(subreddit)) {
    throw new Error(`Invalid subreddit name: ${subreddit}`);
  }

  const empty: SubredditHealth = {
    subreddit,
    exists: false,
    subscribers: null,
    activeUsers: null,
    type: null,
    postingRestricted: false,
    note: null,
  };

  const res = await redditGet(`/r/${subreddit}/about.json`, new URLSearchParams());

  if (res.status === 404) {
    return { ...empty, note: "Subreddit not found (HTTP 404)." };
  }
  if (res.status === 403) {
    // A 403 here is genuinely ambiguous: it is what a private or quarantined
    // subreddit returns, but it is also what Reddit returns when it blocks the
    // caller's IP outright (which is the normal outcome with no credentials
    // configured). Do not resolve that ambiguity here — reporting "private" on
    // what is actually a network block would manufacture a false fact about the
    // community. Leave type unset and let the caller weigh it against
    // `credentialed`.
    return {
      ...empty,
      exists: true,
      note:
        "Reddit returned HTTP 403 on the metadata lookup. This is ambiguous: it " +
        "means either the subreddit is private/quarantined, or that Reddit blocked " +
        "this request at the network level. If the response reports credentialed=false, " +
        "assume a network block. Do not record this as a fact about the community.",
    };
  }
  if (!res.ok) {
    throw new Error(`Reddit about lookup failed for r/${subreddit}: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: {
      display_name?: string;
      subscribers?: number;
      active_user_count?: number;
      subreddit_type?: string;
      submission_type?: string;
    };
  };
  const d = json.data;
  if (!d) {
    return { ...empty, note: "Reddit returned no subreddit data." };
  }

  const type = d.subreddit_type ?? null;
  const postingRestricted = type === "restricted" || type === "private" || type === "archived";

  return {
    subreddit: d.display_name ?? subreddit,
    exists: true,
    subscribers: d.subscribers ?? null,
    activeUsers: d.active_user_count ?? null,
    type,
    postingRestricted,
    note: postingRestricted
      ? `subreddit_type is "${type}" — readable but not openly postable, so treat low result counts as a dead community rather than a quiet week.`
      : null,
  };
}
