// Twitch Helix API fetcher. Requires TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET.
import type { VideoStat } from "./analytics";
import { DiagnosticsError, type ChannelInfo as YTChannelInfo } from "./youtube";

export interface ChannelInfo extends Omit<YTChannelInfo, "platform"> {
  platform: "twitch";
}

const HELIX = "https://api.twitch.tv/helix";

// App access token, cached across requests within the server process
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(clientId: string, secret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DiagnosticsError(
      `Twitch auth failed: ${body?.message ?? res.statusText}. Check TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET.`,
      res.status
    );
  }
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

async function helix(
  path: string,
  params: Record<string, string>,
  clientId: string,
  token: string
) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${HELIX}/${path}?${qs}`, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DiagnosticsError(
      `Twitch API error: ${body?.message ?? res.statusText}`,
      res.status
    );
  }
  return body;
}

/** Parses Twitch VOD durations like "3h20m10s" into seconds. */
function parseTwitchDuration(d: string): number | null {
  const m = d?.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return null;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

/** Accepts a login name, @name, or twitch.tv URL. */
function parseLogin(query: string): string {
  let q = query.trim();
  const urlMatch = q.match(/twitch\.tv\/([^/?#]+)/i);
  if (urlMatch) q = urlMatch[1];
  return q.replace(/^@/, "").toLowerCase();
}

export async function fetchTwitchChannel(
  query: string
): Promise<{ channel: ChannelInfo; videos: VideoStat[] }> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new DiagnosticsError(
      "Twitch is not configured: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET (create an app at dev.twitch.tv/console).",
      501
    );
  }

  const token = await getAppToken(clientId, secret);
  const login = parseLogin(query);

  const userRes = await helix("users", { login }, clientId, token);
  if (!userRes.data?.length) {
    throw new DiagnosticsError(`Could not find a Twitch channel named "${login}"`, 404);
  }
  const user = userRes.data[0];

  let followers: number | null = null;
  try {
    const fRes = await helix(
      "channels/followers",
      { broadcaster_id: user.id, first: "1" },
      clientId,
      token
    );
    followers = fRes.total ?? null;
  } catch {
    // follower count is optional; some tokens lack access
  }

  const channel: ChannelInfo = {
    name: user.display_name,
    url: `https://www.twitch.tv/${user.login}`,
    avatar: user.profile_image_url ?? null,
    followers,
    platform: "twitch",
  };

  const videos: VideoStat[] = [];

  // Past broadcasts (VODs)
  const vodRes = await helix(
    "videos",
    { user_id: user.id, first: "100", type: "archive" },
    clientId,
    token
  );
  for (const v of vodRes.data ?? []) {
    videos.push({
      id: `vod-${v.id}`,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail_url
        ? v.thumbnail_url.replace("%{width}", "320").replace("%{height}", "180")
        : null,
      publishedAt: v.created_at,
      durationSeconds: parseTwitchDuration(v.duration),
      views: v.view_count ?? 0,
      likes: null,
      comments: null,
      kind: "vod",
    });
  }

  // Clips (often the best signal for what moments resonate)
  const clipRes = await helix(
    "clips",
    { broadcaster_id: user.id, first: "100" },
    clientId,
    token
  );
  for (const c of clipRes.data ?? []) {
    videos.push({
      id: `clip-${c.id}`,
      title: c.title,
      url: c.url,
      thumbnail: c.thumbnail_url ?? null,
      publishedAt: c.created_at,
      durationSeconds: c.duration ? Math.round(c.duration) : null,
      views: c.view_count ?? 0,
      likes: null,
      comments: null,
      kind: "clip",
    });
  }

  if (videos.length === 0) {
    throw new DiagnosticsError(
      `"${user.display_name}" has no VODs or clips available to analyze. Twitch only exposes past broadcasts if the channel has VODs enabled.`,
      404
    );
  }

  return { channel, videos };
}
