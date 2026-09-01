// Reading the open web, for the one question that needs it.
//
// Everything else the app knows comes from a shopping API or from the person
// themselves. Brand sizing doesn't: "does Barbour run small" is answered on
// size-guide pages, in forum threads and in reviews, and there is no API for it.
//
// So this is a thin pair — search, then fetch — behind the SerpAPI key that
// already exists for Google Shopping. It stays deliberately small: no crawling,
// no following links out of a page, one page per result, and a hard cap on how
// many. The expensive, rate-limited resource is the search quota, and the way
// to respect it is to ask few questions and cache the answers hard.

import { fetchableUrl } from "./judge";
import { safeFetch } from "./safeFetch";

const ENDPOINT = "https://serpapi.com/search.json";

export function webSearchConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

/**
 * A plain Google search. Returns [] rather than throwing when unconfigured, so
 * every caller degrades to "we don't know" instead of to an error.
 */
export async function search(query: string, limit = 5): Promise<SearchHit[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    gl: "us",
    hl: "en",
    num: String(Math.min(limit, 10)),
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Web search failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    error?: string;
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  // SerpAPI reports quota exhaustion in a 200 body.
  if (json.error) throw new Error(`Web search: ${json.error}`);

  return (json.organic_results ?? [])
    .map((hit) => ({
      title: hit.title ?? "",
      url: hit.link ?? "",
      snippet: hit.snippet ?? "",
    }))
    .filter((hit) => hit.url && hit.title)
    .slice(0, limit);
}

/** Tags whose contents are markup or code, and would otherwise dominate the text. */
const STRIPPED = /<(script|style|noscript|svg|head)[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Everything readable on a page, as plain text.
 *
 * A size chart is a `<table>`, and a table survives this: the cells become
 * space-separated numbers on their own lines, which is exactly what the model
 * needs and costs a fraction of what the raw HTML would.
 */
export function textFromHtml(html: string): string {
  return html
    .replace(STRIPPED, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** How much of one page is worth reading. Size charts are near the top or in a table. */
const MAX_CHARS_PER_PAGE = 6000;

/** Fetch one page as text. Never throws — an unreachable source is just one less source. */
export async function readPage(raw: string): Promise<string | null> {
  const url = fetchableUrl(raw);
  if (!url) return null;

  try {
    // Search results are third-party URLs; safeFetch re-checks every redirect.
    const res = await safeFetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res?.ok) return null;

    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("html") && !type.includes("text/plain")) return null;

    // Bounded before parsing, not after: a 5MB page shouldn't be held in memory
    // to produce 6KB of text.
    const html = (await res.text()).slice(0, 400_000);
    const text = textFromHtml(html);
    return text ? text.slice(0, MAX_CHARS_PER_PAGE) : null;
  } catch {
    return null;
  }
}

/**
 * Search, then read the top few results.
 *
 * Pages are fetched in parallel and the ones that fail are simply absent; the
 * caller gets whatever arrived, in search order, and decides whether that's
 * enough to answer with.
 */
export async function gather(
  query: string,
  { hits = 4, read = 3 }: { hits?: number; read?: number } = {}
): Promise<Array<SearchHit & { text: string }>> {
  const results = await search(query, hits);
  const pages = await Promise.all(
    results.slice(0, read).map(async (hit) => {
      const text = await readPage(hit.url);
      return text ? { ...hit, text } : null;
    })
  );

  return pages.filter((page): page is SearchHit & { text: string } => page !== null);
}
