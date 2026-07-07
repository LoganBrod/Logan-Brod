import type { Highlight } from "./store";

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1, 12) || null;
    if (url.hostname.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const shorts = url.pathname.match(/\/(?:shorts|live|embed)\/([\w-]{11})/);
      if (shorts) return shorts[1];
    }
  } catch {
    // not a URL
  }
  return null;
}

interface HeatPoint {
  start: number;
  duration: number;
  score: number;
}

/**
 * Extract YouTube's "Most replayed" heat map for a video by parsing the watch
 * page. The data has lived in two places over time — heatMarkers inside the
 * player overlay renderer, and macro markers entities — so try both shapes.
 */
async function fetchHeatPoints(videoId: string): Promise<HeatPoint[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  const html = await res.text();

  const points: HeatPoint[] = [];

  // Shape 1: "heatMarkers":[{"heatMarkerRenderer":{"timeRangeStartMillis":0,
  //   "markerDurationMillis":4000,"heatMarkerIntensityScoreNormalized":0.53}},...]
  for (const m of Array.from(html.matchAll(
    /"heatMarkerRenderer":\{"timeRangeStartMillis":(\d+),"markerDurationMillis":(\d+),"heatMarkerIntensityScoreNormalized":([\d.eE+-]+)/g
  ))) {
    points.push({
      start: parseInt(m[1], 10) / 1000,
      duration: parseInt(m[2], 10) / 1000,
      score: parseFloat(m[3]),
    });
  }

  // Shape 2: macroMarkersListEntity markers:
  // {"startMillis":"0","durationMillis":"4000","intensityScoreNormalized":0.53}
  if (points.length === 0) {
    for (const m of Array.from(html.matchAll(
      /\{"startMillis":"(\d+)","durationMillis":"(\d+)","intensityScoreNormalized":([\d.eE+-]+)\}/g
    ))) {
      points.push({
        start: parseInt(m[1], 10) / 1000,
        duration: parseInt(m[2], 10) / 1000,
        score: parseFloat(m[3]),
      });
    }
  }

  return points;
}

/**
 * Turn the heat map into highlight suggestions: pick the top replayed peaks,
 * spaced apart, clamped to the uploaded file's duration.
 */
export async function fetchMostReplayed(
  urlOrId: string,
  videoDuration: number,
  count = 6
): Promise<Highlight[]> {
  const id = parseYouTubeId(urlOrId);
  if (!id) throw new Error("That doesn't look like a YouTube URL or video ID");

  const points = await fetchHeatPoints(id);
  if (points.length === 0) {
    throw new Error(
      "No 'Most replayed' data found — YouTube only shows it on videos with enough views"
    );
  }

  const MIN_GAP = 30;
  const sorted = [...points].sort((a, b) => b.score - a.score);
  const peaks: Highlight[] = [];
  for (const p of sorted) {
    if (peaks.length >= count) break;
    const center = p.start + p.duration / 2;
    if (center > videoDuration) continue;
    if (peaks.some((h) => Math.abs(h.time - center) < MIN_GAP)) continue;
    peaks.push({
      time: center,
      score: p.score,
      suggestedStart: Math.max(0, p.start - 5),
      suggestedEnd: Math.min(videoDuration, p.start + p.duration + 15),
      source: "youtube",
      label: "Most replayed",
    });
  }
  if (peaks.length === 0) {
    throw new Error(
      "Heat map found, but its peaks are past the end of your uploaded file — is this the right video?"
    );
  }
  return peaks.sort((a, b) => a.time - b.time);
}
