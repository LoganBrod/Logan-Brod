// Deep diagnostics for the authenticated user's OWN channel via the
// YouTube Analytics API v2 — watch time, retention, traffic sources, and
// subscriber conversion, none of which the public Data API exposes.

import type { Insight } from "./analytics";
import { DiagnosticsError } from "./youtube";

export interface DeepVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  views: number;
  watchHours: number;
  avgViewDurationSec: number;
  retentionPct: number; // average percentage of the video watched
  subsGained: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface TrafficSource {
  source: string;
  views: number;
  watchHours: number;
  pct: number; // share of views
}

export interface WeekdayViews {
  day: string;
  views: number;
}

export interface DeepDiagnostics {
  channel: { name: string; avatar: string | null; url: string };
  totals: {
    views: number;
    watchHours: number;
    subsGained: number;
    avgRetentionPct: number;
  };
  weekday: WeekdayViews[]; // when your audience actually WATCHES (last 365 days)
  trafficSources: TrafficSource[];
  videos: DeepVideo[]; // sorted by views
  hiddenGems: DeepVideo[]; // high retention, below-median views
  subMagnets: DeepVideo[]; // best subscriber conversion per view
  retentionLaggards: DeepVideo[]; // high views, weak retention
  insights: Insight[];
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const TRAFFIC_LABELS: Record<string, string> = {
  ADVERTISING: "Ads",
  ANNOTATION: "Annotations",
  CAMPAIGN_CARD: "Campaign cards",
  END_SCREEN: "End screens",
  EXT_URL: "External links",
  HASHTAGS: "Hashtag pages",
  NO_LINK_EMBEDDED: "Embedded players",
  NO_LINK_OTHER: "Direct / unknown",
  NOTIFICATION: "Notifications",
  PLAYLIST: "Playlists",
  PRODUCT_PAGE: "Product pages",
  PROMOTED: "Promotions",
  RELATED_VIDEO: "Suggested videos",
  SHORTS: "Shorts feed",
  SOUND_PAGE: "Sound pages",
  SUBSCRIBER: "Subscriber feed",
  YT_CHANNEL: "Channel pages",
  YT_OTHER_PAGE: "Other YouTube pages",
  YT_PLAYLIST_PAGE: "Playlist pages",
  YT_SEARCH: "YouTube search",
};

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DiagnosticsError(
      "YouTube connection expired — please reconnect your account.",
      401
    );
  }
  return body.access_token;
}

async function ytGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DiagnosticsError(
      `YouTube Analytics error: ${body?.error?.message ?? res.statusText}`,
      res.status
    );
  }
  return body;
}

function analyticsQuery(
  params: Record<string, string>,
  token: string
): Promise<{ rows?: (string | number)[][] }> {
  const qs = new URLSearchParams({ ids: "channel==MINE", ...params });
  return ytGet(`https://youtubeanalytics.googleapis.com/v2/reports?${qs}`, token);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function fetchDeepDiagnostics(
  refreshToken: string
): Promise<DeepDiagnostics> {
  const token = await getAccessToken(refreshToken);

  // Own channel identity + creation date
  const chRes = await ytGet(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    token
  );
  if (!chRes.items?.length) {
    throw new DiagnosticsError("No YouTube channel found on this Google account.", 404);
  }
  const ch = chRes.items[0];
  const channelStart = new Date(ch.snippet.publishedAt);
  const today = new Date();
  const yearAgo = new Date(today.getTime() - 365 * 86_400_000);

  const [videoReport, dayReport, trafficReport] = await Promise.all([
    // Per-video lifetime metrics, top 200 by views
    analyticsQuery(
      {
        startDate: isoDate(channelStart),
        endDate: isoDate(today),
        metrics:
          "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,comments,shares",
        dimensions: "video",
        sort: "-views",
        maxResults: "200",
      },
      token
    ),
    // Daily views over the last year → when the audience actually watches
    analyticsQuery(
      {
        startDate: isoDate(yearAgo),
        endDate: isoDate(today),
        metrics: "views",
        dimensions: "day",
      },
      token
    ),
    // Where views come from
    analyticsQuery(
      {
        startDate: isoDate(channelStart),
        endDate: isoDate(today),
        metrics: "views,estimatedMinutesWatched",
        dimensions: "insightTrafficSourceType",
        sort: "-views",
      },
      token
    ),
  ]);

  // Titles/thumbnails for the reported videos via the Data API (OAuth token works)
  const videoIds = (videoReport.rows ?? []).map((r) => String(r[0]));
  const meta = new Map<string, { title: string; thumbnail: string | null }>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const vRes = await ytGet(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.join(",")}&maxResults=50`,
      token
    );
    for (const v of vRes.items ?? []) {
      meta.set(v.id, {
        title: v.snippet.title,
        thumbnail: v.snippet.thumbnails?.medium?.url ?? null,
      });
    }
  }

  const videos: DeepVideo[] = (videoReport.rows ?? []).map((r) => {
    const [id, views, minutes, avgDur, avgPct, subs, likes, comments, shares] = r;
    return {
      id: String(id),
      title: meta.get(String(id))?.title ?? String(id),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: meta.get(String(id))?.thumbnail ?? null,
      views: +views,
      watchHours: Math.round((+minutes / 60) * 10) / 10,
      avgViewDurationSec: +avgDur,
      retentionPct: +avgPct,
      subsGained: +subs,
      likes: +likes,
      comments: +comments,
      shares: +shares,
    };
  });

  // Weekday aggregation of daily views
  const weekdayTotals = new Array(7).fill(0);
  for (const row of dayReport.rows ?? []) {
    const d = new Date(`${row[0]}T00:00:00Z`);
    weekdayTotals[d.getUTCDay()] += +row[1];
  }
  const weekday: WeekdayViews[] = WEEKDAYS.map((day, i) => ({
    day,
    views: weekdayTotals[i],
  }));

  const totalTrafficViews = (trafficReport.rows ?? []).reduce(
    (sum, r) => sum + +r[1],
    0
  );
  const trafficSources: TrafficSource[] = (trafficReport.rows ?? []).map((r) => ({
    source: TRAFFIC_LABELS[String(r[0])] ?? String(r[0]),
    views: +r[1],
    watchHours: Math.round((+r[2] / 60) * 10) / 10,
    pct: totalTrafficViews > 0 ? (+r[1] / totalTrafficViews) * 100 : 0,
  }));

  // --- Derived lists ---
  const medViews = median(videos.map((v) => v.views));
  const retentions = videos.filter((v) => v.retentionPct > 0);
  const avgRetention =
    retentions.length > 0
      ? retentions.reduce((s, v) => s + v.retentionPct, 0) / retentions.length
      : 0;

  const hiddenGems = videos
    .filter((v) => v.retentionPct >= Math.max(avgRetention * 1.2, 45) && v.views < medViews)
    .sort((a, b) => b.retentionPct - a.retentionPct)
    .slice(0, 5);

  const subMagnets = videos
    .filter((v) => v.views >= 100 && v.subsGained > 0)
    .sort((a, b) => b.subsGained / b.views - a.subsGained / a.views)
    .slice(0, 5);

  const retentionLaggards = videos
    .filter((v) => v.views > medViews && v.retentionPct > 0 && v.retentionPct < avgRetention * 0.7)
    .sort((a, b) => a.retentionPct - b.retentionPct)
    .slice(0, 5);

  // --- Deep insights ---
  const insights: Insight[] = [];

  const totals = {
    views: videos.reduce((s, v) => s + v.views, 0),
    watchHours: Math.round(videos.reduce((s, v) => s + v.watchHours, 0)),
    subsGained: videos.reduce((s, v) => s + v.subsGained, 0),
    avgRetentionPct: Math.round(avgRetention * 10) / 10,
  };

  const bestWatchDay = [...weekday].sort((a, b) => b.views - a.views)[0];
  const totalWeekViews = weekday.reduce((s, w) => s + w.views, 0);
  if (bestWatchDay && totalWeekViews > 0) {
    insights.push({
      id: "watch-day",
      title: "When your audience actually watches",
      finding: `${bestWatchDay.day} is your biggest viewing day (${Math.round((bestWatchDay.views / totalWeekViews) * 100)}% of weekly views)`,
      detail: `Unlike publish-day analysis, this is measured from when views actually happen. Publish the evening before or morning of ${bestWatchDay.day} so fresh videos ride your audience's peak.`,
    });
  }

  if (avgRetention > 0) {
    insights.push({
      id: "retention",
      title: "Audience retention",
      finding: `Viewers watch ${totals.avgRetentionPct}% of your videos on average — ${
        avgRetention >= 50 ? "a strong signal" : avgRetention >= 35 ? "room to improve" : "your biggest growth blocker"
      }`,
      detail:
        avgRetention >= 50
          ? "50%+ average retention tells the algorithm your content delivers. Protect it: keep intros under 15 seconds and cut ruthlessly."
          : "Retention below ~50% limits how widely YouTube recommends you. Tighten intros to under 15 seconds, open with the payoff, and study the retention graphs of your laggards below.",
    });
  }

  if (trafficSources.length > 0) {
    const top = trafficSources[0];
    const searchSrc = trafficSources.find((t) => t.source === "YouTube search");
    const suggestedSrc = trafficSources.find((t) => t.source === "Suggested videos");
    let advice = "";
    if (top.source === "YouTube search") {
      advice = "Search-driven channels win with keyword-rich titles and descriptions — double down on searchable topics.";
    } else if (top.source === "Suggested videos") {
      advice = "Suggested-driven channels win with strong thumbnails, session time, and series/playlists that chain videos together.";
    } else if (top.source === "Shorts feed") {
      advice = "Shorts drive your discovery — use them to funnel viewers to long-form via pinned comments and end links.";
    } else {
      advice = `Diversify: search is ${searchSrc ? Math.round(searchSrc.pct) : 0}% and suggested is ${suggestedSrc ? Math.round(suggestedSrc.pct) : 0}% of your views — both grow with better titles, thumbnails, and playlists.`;
    }
    insights.push({
      id: "traffic",
      title: "Where your views come from",
      finding: `${top.source} drives ${Math.round(top.pct)}% of your views`,
      detail: advice,
    });
  }

  if (hiddenGems.length > 0) {
    insights.push({
      id: "hidden-gems",
      title: "Hidden gems",
      finding: `${hiddenGems.length} videos hold attention brilliantly but few people click them`,
      detail: `These have above-average retention but below-median views — the content works, the packaging doesn't. Re-do their titles and thumbnails, feature them in end screens, or remake the topic; the audience clearly stays when they arrive.`,
    });
  }

  if (retentionLaggards.length > 0) {
    insights.push({
      id: "laggards",
      title: "Clickbait risk",
      finding: `${retentionLaggards.length} popular videos lose viewers unusually fast`,
      detail: `These get clicks but viewers bail early — the title/thumbnail promises something the video doesn't deliver quickly. That mismatch teaches the algorithm to stop recommending you. Deliver the promised payoff in the first 30 seconds.`,
    });
  }

  if (subMagnets.length > 0) {
    const best = subMagnets[0];
    insights.push({
      id: "sub-magnets",
      title: "Subscriber magnets",
      finding: `"${best.title}" converts viewers to subscribers ${(
        (best.subsGained / best.views) * 1000
      ).toFixed(1)}× per 1,000 views`,
      detail: `Your subscriber-magnet videos show what makes people commit to the channel, not just the video. Make more like them, and point end screens from popular videos toward them.`,
    });
  }

  return {
    channel: {
      name: ch.snippet.title,
      avatar: ch.snippet.thumbnails?.medium?.url ?? null,
      url: `https://www.youtube.com/channel/${ch.id}`,
    },
    totals,
    weekday,
    trafficSources,
    videos,
    hiddenGems,
    subMagnets,
    retentionLaggards,
    insights,
  };
}
