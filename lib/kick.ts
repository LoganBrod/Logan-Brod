// Kick fetcher. Uses Kick's public site API (kick.com/api/v2) — no API key
// required. Kick's official developer API doesn't expose VODs or clips yet,
// and the site API sits behind Cloudflare, so requests can occasionally be
// blocked depending on the server's IP; errors surface a clear message.

import type { VideoStat } from "./analytics";
import { DiagnosticsError, type ChannelInfo as YTChannelInfo } from "./youtube";

export interface ChannelInfo extends Omit<YTChannelInfo, "platform"> {
  platform: "kick";
}

const HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

async function kickGet(path: string): Promise<any> {
  const res = await fetch(`https://kick.com/api/v2/${path}`, {
    headers: HEADERS,
    cache: "no-store",
  });
  if (res.status === 404) return null;
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    // Cloudflare challenge pages come back as HTML
    throw new DiagnosticsError(
      "Kick's API blocked this request (Cloudflare protection). This happens intermittently for server-side requests — try again in a minute.",
      503
    );
  }
  if (!res.ok) {
    throw new DiagnosticsError(
      `Kick API error: ${body?.message ?? res.statusText}`,
      res.status
    );
  }
  return body;
}

/** Accepts a channel slug, @name, or kick.com URL. */
function parseSlug(query: string): string {
  let q = query.trim();
  const urlMatch = q.match(/kick\.com\/([^/?#]+)/i);
  if (urlMatch) q = urlMatch[1];
  return q.replace(/^@/, "").toLowerCase();
}

function num(...candidates: unknown[]): number {
  for (const c of candidates) {
    if (typeof c === "number" && !isNaN(c)) return c;
    if (typeof c === "string" && c !== "" && !isNaN(+c)) return +c;
  }
  return 0;
}

export async function fetchKickChannel(
  query: string
): Promise<{ channel: ChannelInfo; videos: VideoStat[] }> {
  const slug = parseSlug(query);

  const ch = await kickGet(`channels/${encodeURIComponent(slug)}`);
  if (!ch) {
    throw new DiagnosticsError(`Could not find a Kick channel named "${slug}"`, 404);
  }

  const channel: ChannelInfo = {
    name: ch.user?.username ?? ch.slug ?? slug,
    url: `https://kick.com/${ch.slug ?? slug}`,
    avatar: ch.user?.profile_pic ?? null,
    followers: num(ch.followers_count, ch.followersCount) || null,
    platform: "kick",
  };

  const videos: VideoStat[] = [];

  // Past broadcasts (VODs). Field names on this endpoint have shifted over
  // time, so read them defensively.
  const vods = await kickGet(`channels/${encodeURIComponent(slug)}/videos`);
  for (const v of Array.isArray(vods) ? vods : (vods?.data ?? [])) {
    const publishedAt =
      v.start_time ?? v.created_at ?? v.video?.created_at ?? null;
    if (!publishedAt) continue;
    const durationMs = num(v.duration, v.video?.duration);
    videos.push({
      id: `vod-${v.id ?? v.video?.uuid ?? publishedAt}`,
      title: v.session_title ?? v.title ?? "Untitled stream",
      url: v.video?.uuid
        ? `https://kick.com/${slug}/videos/${v.video.uuid}`
        : `https://kick.com/${slug}`,
      thumbnail: v.thumbnail?.src ?? v.thumbnail ?? null,
      publishedAt,
      // Kick reports VOD duration in milliseconds
      durationSeconds: durationMs > 0 ? Math.round(durationMs / 1000) : null,
      views: num(v.views, v.video?.views),
      likes: null,
      comments: null,
      kind: "vod",
    });
  }

  // Top clips
  const clipRes = await kickGet(
    `channels/${encodeURIComponent(slug)}/clips?sort=view&time=all`
  );
  for (const c of clipRes?.clips ?? []) {
    if (!c.created_at) continue;
    videos.push({
      id: `clip-${c.id}`,
      title: c.title ?? "Untitled clip",
      url: c.clip_url ?? `https://kick.com/${slug}?clip=${c.id}`,
      thumbnail: c.thumbnail_url ?? null,
      publishedAt: c.created_at,
      durationSeconds: num(c.duration) > 0 ? Math.round(num(c.duration)) : null,
      views: num(c.views, c.view_count),
      likes: num(c.likes, c.likes_count) || null,
      comments: null,
      kind: "clip",
    });
  }

  if (videos.length === 0) {
    throw new DiagnosticsError(
      `"${channel.name}" has no VODs or clips available to analyze. Kick only keeps VODs if the channel has them enabled.`,
      404
    );
  }

  return { channel, videos };
}
