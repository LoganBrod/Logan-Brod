// Shared analytics engine for channel diagnostics.
// Takes a normalized list of videos (from YouTube or Twitch) and produces
// a ranked list plus channel-level insights explaining WHY top videos win.

export interface VideoStat {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  publishedAt: string; // ISO 8601
  durationSeconds: number | null;
  views: number;
  likes: number | null;
  comments: number | null;
  kind: "video" | "vod" | "clip";
  hashtags?: string[]; // extracted from title + description (YouTube only)
  tags?: string[]; // creator-set tags (YouTube only)
}

export interface RankedVideo extends VideoStat {
  score: number; // 0-100
  viewsPerDay: number;
  engagementRate: number | null; // (likes + comments) / views
  reasons: string[]; // per-video explanations of why it performed
}

export interface Insight {
  id: string;
  title: string;
  finding: string; // one-line headline
  detail: string; // supporting explanation
}

export interface ChannelSummary {
  videosAnalyzed: number;
  totalViews: number;
  avgViews: number;
  medianViews: number;
  avgEngagementRate: number | null;
  uploadsPerWeek: number | null;
}

export interface Diagnostics {
  summary: ChannelSummary;
  videos: RankedVideo[];
  insights: Insight[];
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "is", "it", "its", "this", "that", "was", "are", "be", "my", "your",
  "you", "i", "we", "me", "he", "she", "they", "his", "her", "our", "vs",
  "ft", "feat", "how", "what", "when", "why", "who", "from", "by", "as",
  "so", "if", "not", "no", "do", "did", "get", "got", "out", "up", "just",
]);

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds)}s`;
}

interface Bucket<T> {
  label: string;
  items: T[];
}

function bucketBy<T>(items: T[], labelOf: (item: T) => string | null): Bucket<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const label = labelOf(item);
    if (label === null) continue;
    const list = map.get(label) ?? [];
    list.push(item);
    map.set(label, list);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

/** Best bucket by median views, requiring enough data to be meaningful. */
function bestBucket(
  buckets: Bucket<RankedVideo>[],
  minPerBucket = 3
): { best: Bucket<RankedVideo>; lift: number } | null {
  const eligible = buckets.filter((b) => b.items.length >= minPerBucket);
  if (eligible.length < 2) return null;
  const scored = eligible
    .map((b) => ({ bucket: b, med: median(b.items.map((v) => v.views)) }))
    .sort((a, b) => b.med - a.med);
  const best = scored[0];
  const rest = scored.slice(1).flatMap((s) => s.bucket.items.map((v) => v.views));
  const restMed = median(rest);
  if (restMed <= 0 || best.med <= 0) return null;
  const lift = best.med / restMed;
  if (lift < 1.25) return null; // not a meaningful difference
  return { best: best.bucket, lift };
}

function durationBucket(v: VideoStat): string | null {
  const s = v.durationSeconds;
  if (s === null || s <= 0) return null;
  if (s < 60) return "under 1 min";
  if (s < 300) return "1–5 min";
  if (s < 600) return "5–10 min";
  if (s < 1200) return "10–20 min";
  if (s < 3600) return "20–60 min";
  if (s < 3 * 3600) return "1–3 hours";
  return "over 3 hours";
}

function titleLengthBucket(v: VideoStat): string {
  const len = v.title.length;
  if (len < 30) return "short (under 30 chars)";
  if (len <= 55) return "medium (30–55 chars)";
  return "long (over 55 chars)";
}

function timeOfDayBucket(v: VideoStat): string {
  const h = new Date(v.publishedAt).getUTCHours();
  if (h < 6) return "night (00–06 UTC)";
  if (h < 12) return "morning (06–12 UTC)";
  if (h < 18) return "afternoon (12–18 UTC)";
  return "evening (18–24 UTC)";
}

function keywordLift(videos: RankedVideo[]): { word: string; lift: number; count: number }[] {
  const overallMed = median(videos.map((v) => v.views));
  if (overallMed <= 0) return [];
  const wordMap = new Map<string, RankedVideo[]>();
  for (const v of videos) {
    const words = new Set(
      v.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    );
    for (const w of Array.from(words)) {
      const list = wordMap.get(w) ?? [];
      list.push(v);
      wordMap.set(w, list);
    }
  }
  const results: { word: string; lift: number; count: number }[] = [];
  for (const [word, vids] of Array.from(wordMap.entries())) {
    if (vids.length < 3 || vids.length > videos.length * 0.6) continue;
    const lift = median(vids.map((v) => v.views)) / overallMed;
    if (lift >= 1.5) results.push({ word, lift, count: vids.length });
  }
  return results.sort((a, b) => b.lift - a.lift).slice(0, 5);
}

export function analyzeChannel(raw: VideoStat[]): Diagnostics {
  const now = Date.now();
  const videos: RankedVideo[] = raw
    .filter((v) => v.views >= 0 && !isNaN(Date.parse(v.publishedAt)))
    .map((v) => {
      const ageDays = Math.max(1, (now - Date.parse(v.publishedAt)) / 86_400_000);
      const engagementRate =
        v.likes !== null && v.views > 0
          ? (v.likes + (v.comments ?? 0)) / v.views
          : null;
      return {
        ...v,
        score: 0,
        viewsPerDay: v.views / ageDays,
        engagementRate,
        reasons: [],
      };
    });

  if (videos.length === 0) {
    return {
      summary: {
        videosAnalyzed: 0,
        totalViews: 0,
        avgViews: 0,
        medianViews: 0,
        avgEngagementRate: null,
        uploadsPerWeek: null,
      },
      videos: [],
      insights: [],
    };
  }

  // --- Scoring: blend lifetime views, velocity, and engagement ---
  const nViews = normalize(videos.map((v) => Math.log10(v.views + 1)));
  const nVpd = normalize(videos.map((v) => Math.log10(v.viewsPerDay + 1)));
  const hasEngagement = videos.some((v) => v.engagementRate !== null);
  const nEng = hasEngagement
    ? normalize(videos.map((v) => v.engagementRate ?? 0))
    : videos.map(() => 0);
  videos.forEach((v, i) => {
    const weights = hasEngagement
      ? { views: 0.55, vpd: 0.3, eng: 0.15 }
      : { views: 0.65, vpd: 0.35, eng: 0 };
    v.score = Math.round(
      100 * (weights.views * nViews[i] + weights.vpd * nVpd[i] + weights.eng * nEng[i])
    );
  });
  videos.sort((a, b) => b.score - a.score);

  // --- Summary ---
  const viewCounts = videos.map((v) => v.views);
  const engRates = videos
    .map((v) => v.engagementRate)
    .filter((e): e is number => e !== null);
  const dates = videos.map((v) => Date.parse(v.publishedAt)).sort((a, b) => a - b);
  const spanWeeks = (dates[dates.length - 1] - dates[0]) / (7 * 86_400_000);
  const summary: ChannelSummary = {
    videosAnalyzed: videos.length,
    totalViews: viewCounts.reduce((a, b) => a + b, 0),
    avgViews: Math.round(mean(viewCounts)),
    medianViews: Math.round(median(viewCounts)),
    avgEngagementRate: engRates.length ? mean(engRates) : null,
    uploadsPerWeek: spanWeeks > 1 ? videos.length / spanWeeks : null,
  };

  // --- Channel-level insights ---
  const insights: Insight[] = [];

  const dayResult = bestBucket(
    bucketBy(videos, (v) => WEEKDAYS[new Date(v.publishedAt).getUTCDay()])
  );
  if (dayResult) {
    insights.push({
      id: "best-day",
      title: "Best day to publish",
      finding: `${dayResult.best.label} uploads earn ${dayResult.lift.toFixed(1)}× the typical views`,
      detail: `Across ${dayResult.best.items.length} uploads, videos published on ${dayResult.best.label} have a median of ${formatViews(median(dayResult.best.items.map((v) => v.views)))} views vs ${formatViews(summary.medianViews)} overall. Try scheduling your strongest content on ${dayResult.best.label}.`,
    });
  }

  const timeResult = bestBucket(bucketBy(videos, timeOfDayBucket));
  if (timeResult) {
    insights.push({
      id: "best-time",
      title: "Best time of day",
      finding: `Publishing in the ${timeResult.best.label} performs ${timeResult.lift.toFixed(1)}× better`,
      detail: `${timeResult.best.items.length} videos published in the ${timeResult.best.label} out-perform the rest of your schedule. Times are in UTC — convert to when your audience is most active locally.`,
    });
  }

  const durResult = bestBucket(bucketBy(videos, durationBucket));
  if (durResult) {
    insights.push({
      id: "duration",
      title: "Length sweet spot",
      finding: `Videos ${durResult.best.label} earn ${durResult.lift.toFixed(1)}× the typical views`,
      detail: `Your ${durResult.best.items.length} videos in the ${durResult.best.label} range have a median of ${formatViews(median(durResult.best.items.map((v) => v.views)))} views. Length correlates with how the algorithm surfaces your content — lean into this range.`,
    });
  }

  const titleResult = bestBucket(bucketBy(videos, titleLengthBucket));
  if (titleResult) {
    insights.push({
      id: "title-length",
      title: "Title length",
      finding: `${titleResult.best.label.charAt(0).toUpperCase() + titleResult.best.label.slice(1)} titles win by ${titleResult.lift.toFixed(1)}×`,
      detail: `Titles in this range have a median of ${formatViews(median(titleResult.best.items.map((v) => v.views)))} views across ${titleResult.best.items.length} videos. Titles drive click-through rate, one of the biggest levers you control.`,
    });
  }

  const keywords = keywordLift(videos);
  if (keywords.length > 0) {
    insights.push({
      id: "keywords",
      title: "Winning title keywords",
      finding: `Titles containing “${keywords[0].word}” earn ${keywords[0].lift.toFixed(1)}× the typical views`,
      detail: `Top-performing words in your titles: ${keywords
        .map((k) => `“${k.word}” (${k.lift.toFixed(1)}× across ${k.count} videos)`)
        .join(", ")}. These topics resonate with your audience — make more content around them.`,
    });
  }

  if (videos.length >= 9) {
    const byDate = [...videos].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    );
    const recentCount = Math.max(3, Math.floor(videos.length / 3));
    const recent = byDate.slice(0, recentCount);
    const older = byDate.slice(recentCount);
    // Views front-load (a fresh video always has higher views/day, an old one
    // always has more total views), so each direction is judged by the metric
    // biased AGAINST it — findings here are conservative by construction:
    // "gaining" requires recent TOTAL views to beat older despite having had
    // less time to accumulate; "slowing" requires recent views/day to trail
    // older despite the recency advantage.
    const recentViews = median(recent.map((v) => v.views));
    const olderViews = median(older.map((v) => v.views));
    const recentVpd = median(recent.map((v) => v.viewsPerDay));
    const olderVpd = median(older.map((v) => v.viewsPerDay));
    if (olderViews > 0 && recentViews >= olderViews * 1.3) {
      insights.push({
        id: "momentum",
        title: "Channel momentum",
        finding: `Your channel is gaining momentum — recent videos already have ${(recentViews / olderViews).toFixed(1)}× the median views of earlier uploads`,
        detail: `Your last ${recentCount} videos have a median of ${formatViews(Math.round(recentViews))} views vs ${formatViews(Math.round(olderViews))} for earlier uploads, despite having had less time to accumulate them. Whatever changed recently is working — keep doing it.`,
      });
    } else if (olderVpd > 0 && recentVpd <= olderVpd * 0.7) {
      insights.push({
        id: "momentum",
        title: "Channel momentum",
        finding: `Recent videos are earning views ${(olderVpd / recentVpd).toFixed(1)}× slower than your earlier uploads`,
        detail: `Your last ${recentCount} videos average ${formatViews(Math.round(recentVpd))} views/day vs ${formatViews(Math.round(olderVpd))} views/day for earlier uploads — and fresh videos normally earn views faster, not slower. Compare recent titles, formats, and topics against your top performers below to see what changed.`,
      });
    }
  }

  if (hasEngagement && engRates.length >= 6) {
    const topQuartile = videos.slice(0, Math.max(2, Math.floor(videos.length / 4)));
    const topEng = mean(
      topQuartile
        .map((v) => v.engagementRate)
        .filter((e): e is number => e !== null)
    );
    const avgEng = mean(engRates);
    if (avgEng > 0 && topEng / avgEng >= 1.3) {
      insights.push({
        id: "engagement",
        title: "Engagement drives reach",
        finding: `Your top videos get ${(topEng / avgEng).toFixed(1)}× more likes & comments per view`,
        detail: `Top performers average ${(topEng * 100).toFixed(1)}% engagement vs ${(avgEng * 100).toFixed(1)}% channel-wide. Algorithms promote videos people interact with — end with a question, pin a comment, and give viewers a reason to respond.`,
      });
    }
  }

  if (summary.uploadsPerWeek !== null) {
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / 86_400_000);
    const medGap = median(gaps);
    const maxGap = Math.max(...gaps);
    if (medGap > 0 && maxGap > medGap * 4 && maxGap > 21) {
      insights.push({
        id: "consistency",
        title: "Upload consistency",
        finding: `Your longest gap between uploads was ${Math.round(maxGap)} days — ${(maxGap / medGap).toFixed(0)}× your usual pace`,
        detail: `You typically upload every ${Math.round(medGap)} days (~${summary.uploadsPerWeek.toFixed(1)}/week). Long gaps reset algorithmic momentum and audience habits; a consistent schedule compounds.`,
      });
    }
  }

  // --- Per-video reasons for the top performers ---
  const medViews = summary.medianViews;
  const avgEng = summary.avgEngagementRate;
  const vpdSorted = [...videos].sort((a, b) => b.viewsPerDay - a.viewsPerDay);
  const vpdTopDecile = new Set(
    vpdSorted.slice(0, Math.max(1, Math.floor(videos.length / 10))).map((v) => v.id)
  );
  for (const v of videos) {
    if (medViews > 0 && v.views >= medViews * 2) {
      reasonPush(v, `${(v.views / medViews).toFixed(1)}× your median views`);
    }
    if (avgEng !== null && v.engagementRate !== null && avgEng > 0 && v.engagementRate >= avgEng * 1.5) {
      reasonPush(v, `high engagement (${(v.engagementRate * 100).toFixed(1)}% vs ${(avgEng * 100).toFixed(1)}% avg)`);
    }
    if (vpdTopDecile.has(v.id)) {
      reasonPush(v, `earning views fastest (${formatViews(Math.round(v.viewsPerDay))}/day)`);
    }
    if (dayResult && WEEKDAYS[new Date(v.publishedAt).getUTCDay()] === dayResult.best.label) {
      reasonPush(v, `posted on ${dayResult.best.label}, your best day`);
    }
    if (durResult && durationBucket(v) === durResult.best.label) {
      reasonPush(v, `length in your ${durResult.best.label} sweet spot`);
    }
    if (keywords.length && keywords.some((k) => v.title.toLowerCase().includes(k.word))) {
      const hit = keywords.find((k) => v.title.toLowerCase().includes(k.word))!;
      reasonPush(v, `title uses winning keyword “${hit.word}”`);
    }
  }

  return { summary, videos, insights };
}

function reasonPush(v: RankedVideo, reason: string) {
  if (v.reasons.length < 4) v.reasons.push(reason);
}

export { formatViews, formatDuration };
