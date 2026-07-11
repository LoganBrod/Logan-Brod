// YouTube Data API v3 fetcher. Requires YOUTUBE_API_KEY.
import type { VideoStat } from "./analytics";

const API = "https://www.googleapis.com/youtube/v3";
const MAX_VIDEOS = 200;

export interface ChannelInfo {
  name: string;
  url: string;
  avatar: string | null;
  followers: number | null; // subscribers
  platform: "youtube";
}

export class DiagnosticsError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function yt(path: string, params: Record<string, string>, key: string) {
  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API}/${path}?${qs}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.message ?? res.statusText;
    throw new DiagnosticsError(`YouTube API error: ${reason}`, res.status);
  }
  return body;
}

/** Accepts @handle, channel URL, raw channel ID (UC...), or a plain name. */
async function resolveChannelId(query: string, key: string): Promise<string> {
  let q = query.trim();

  // URL forms
  const urlMatch = q.match(
    /youtube\.com\/(?:(channel)\/([^/?#]+)|(?:c\/|user\/|@)([^/?#]+))/i
  );
  if (urlMatch) {
    if (urlMatch[1] === "channel") return urlMatch[2];
    q = urlMatch[3];
  }

  if (/^UC[\w-]{22}$/.test(q)) return q;

  // Handle lookup
  const handle = q.startsWith("@") ? q : `@${q}`;
  const byHandle = await yt("channels", { part: "id", forHandle: handle }, key);
  if (byHandle.items?.length) return byHandle.items[0].id;

  // Fallback: search
  const search = await yt(
    "search",
    { part: "snippet", type: "channel", q, maxResults: "1" },
    key
  );
  if (search.items?.length) return search.items[0].snippet.channelId;

  throw new DiagnosticsError(`Could not find a YouTube channel matching "${query}"`, 404);
}

function parseISODuration(iso: string): number | null {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

export async function fetchYouTubeChannel(
  query: string
): Promise<{ channel: ChannelInfo; videos: VideoStat[] }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new DiagnosticsError(
      "YouTube is not configured: set the YOUTUBE_API_KEY environment variable (get a free key at console.cloud.google.com → YouTube Data API v3).",
      501
    );
  }

  const channelId = await resolveChannelId(query, key);
  const chRes = await yt(
    "channels",
    { part: "snippet,statistics,contentDetails", id: channelId },
    key
  );
  if (!chRes.items?.length) {
    throw new DiagnosticsError(`YouTube channel ${channelId} not found`, 404);
  }
  const ch = chRes.items[0];
  const uploadsPlaylist = ch.contentDetails?.relatedPlaylists?.uploads;

  const channel: ChannelInfo = {
    name: ch.snippet.title,
    url: `https://www.youtube.com/channel/${channelId}`,
    avatar: ch.snippet.thumbnails?.medium?.url ?? ch.snippet.thumbnails?.default?.url ?? null,
    followers: ch.statistics?.subscriberCount ? +ch.statistics.subscriberCount : null,
    platform: "youtube",
  };

  // Page through the uploads playlist for recent video IDs
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  while (videoIds.length < MAX_VIDEOS) {
    const page = await yt(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId: uploadsPlaylist,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      },
      key
    );
    for (const item of page.items ?? []) {
      videoIds.push(item.contentDetails.videoId);
    }
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  // Fetch stats in batches of 50
  const videos: VideoStat[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const vRes = await yt(
      "videos",
      { part: "snippet,statistics,contentDetails", id: batch.join(","), maxResults: "50" },
      key
    );
    for (const v of vRes.items ?? []) {
      const text = `${v.snippet.title ?? ""}\n${v.snippet.description ?? ""}`;
      const hashtags = Array.from(
        new Set(
          (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h: string) => h.toLowerCase())
        )
      ) as string[];
      videos.push({
        id: v.id,
        title: v.snippet.title,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail: v.snippet.thumbnails?.medium?.url ?? null,
        publishedAt: v.snippet.publishedAt,
        durationSeconds: parseISODuration(v.contentDetails?.duration ?? ""),
        views: +(v.statistics?.viewCount ?? 0),
        likes: v.statistics?.likeCount !== undefined ? +v.statistics.likeCount : null,
        comments: v.statistics?.commentCount !== undefined ? +v.statistics.commentCount : null,
        kind: "video",
        hashtags,
        tags: v.snippet.tags ?? [],
      });
    }
  }

  return { channel, videos };
}
