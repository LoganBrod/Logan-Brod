const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Resolve a Kick channel slug to its live HLS playback URL. Kick sits behind
 * aggressive bot protection, so this can fail even when the channel is live —
 * the error message points the user at the manual m3u8 fallback.
 */
export async function resolveKickStream(slug: string): Promise<string> {
  const clean = slug
    .trim()
    .replace(/^https?:\/\/(www\.)?kick\.com\//i, "")
    .replace(/[/?#].*$/, "");
  if (!/^[\w-]{3,30}$/.test(clean)) {
    throw new Error("That doesn't look like a Kick channel name");
  }

  let res: Response;
  try {
    res = await fetch(`https://kick.com/api/v2/channels/${clean}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
  } catch {
    throw new Error(
      "Couldn't reach Kick. You can paste the stream's .m3u8 URL directly instead (open the stream, DevTools → Network → filter 'm3u8')."
    );
  }
  if (!res.ok) {
    throw new Error(
      `Kick API returned ${res.status} (their bot protection can block server requests). Paste the stream's .m3u8 URL directly instead.`
    );
  }

  const data = (await res.json()) as {
    playback_url?: string;
    livestream?: { is_live?: boolean } | null;
  };
  if (!data.playback_url) {
    throw new Error(`"${clean}" appears to be offline (no live playback URL)`);
  }
  return data.playback_url;
}
