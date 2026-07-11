// Live web research: pulls current best-practice findings from the web to
// supplement the curated benchmarks. Uses the Tavily search API when
// TAVILY_API_KEY is set (free tier at tavily.com); silently returns null
// otherwise so the app still works from curated benchmarks alone.

export interface WebFinding {
  query: string;
  title: string;
  url: string;
  snippet: string;
}

const QUERIES: Record<"youtube" | "twitch", string[]> = {
  youtube: [
    "best time and day to post YouTube videos study data",
    "YouTube hashtags and keywords best practices for views",
    "YouTube title and thumbnail best practices click-through rate study",
  ],
  twitch: [
    "best time and day to stream on Twitch for growth study",
    "how to grow a Twitch channel clips strategy best practices",
  ],
};

// Cache results in the server process so repeated diagnoses don't re-search
const cache = new Map<string, { findings: WebFinding[]; expiresAt: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

export async function liveResearch(
  platform: "youtube" | "twitch"
): Promise<WebFinding[] | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  const cached = cache.get(platform);
  if (cached && cached.expiresAt > Date.now()) return cached.findings;

  try {
    const results = await Promise.all(
      QUERIES[platform].map(async (query) => {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: 3,
            search_depth: "basic",
          }),
          cache: "no-store",
        });
        if (!res.ok) return [];
        const body = await res.json();
        return (body.results ?? []).map(
          (r: { title: string; url: string; content: string }): WebFinding => ({
            query,
            title: r.title,
            url: r.url,
            snippet:
              r.content.length > 280 ? `${r.content.slice(0, 277)}…` : r.content,
          })
        );
      })
    );
    const findings = results.flat();
    cache.set(platform, { findings, expiresAt: Date.now() + CACHE_TTL });
    return findings;
  } catch (err) {
    console.error("live research failed:", err);
    return null;
  }
}
