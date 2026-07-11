// Cross-reference engine: compares the channel's MEASURED patterns against
// published industry benchmarks and produces an improvement plan — where the
// channel already aligns with best practice, where it should adjust, and
// untapped opportunities.

import type { Diagnostics, RankedVideo } from "./analytics";
import { formatViews } from "./analytics";
import { BENCHMARKS, type Source } from "./benchmarks";

export interface Recommendation {
  id: string;
  topic: string;
  status: "aligned" | "adjust" | "opportunity";
  yourData: string; // what the channel's own numbers show
  industry: string; // what published sources say
  action: string; // what to do about it
  sources: Source[];
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function crossReference(
  diag: Diagnostics,
  platform: "youtube" | "twitch"
): Recommendation[] {
  const recs: Recommendation[] = [];
  const { videos, insights, summary } = diag;
  if (videos.length === 0) return recs;

  const insight = (id: string) => insights.find((i) => i.id === id);

  // --- Posting day: your best day vs industry consensus ---
  const dayIns = insight("best-day");
  if (dayIns) {
    const yourDay = dayIns.finding.split(" ")[0]; // finding starts with the weekday
    const aligned = (BENCHMARKS.postingDays.bestDays as readonly string[]).includes(yourDay);
    recs.push({
      id: "day",
      topic: BENCHMARKS.postingDays.topic,
      status: aligned ? "aligned" : "adjust",
      yourData: dayIns.finding,
      industry: BENCHMARKS.postingDays.guidance,
      action: aligned
        ? `Your data agrees with the studies — lock in ${yourDay} as your primary upload day.`
        : `Your audience behaves differently from the general consensus (${BENCHMARKS.postingDays.bestDays.join(", ")}). Trust your own data first — keep ${yourDay} — but A/B test a Thu–Sun slot for a month to confirm.`,
      sources: [...BENCHMARKS.postingDays.sources],
    });
  } else {
    recs.push({
      id: "day",
      topic: BENCHMARKS.postingDays.topic,
      status: "opportunity",
      yourData:
        "No statistically meaningful best-day pattern found in your uploads yet — you may be posting on too few distinct days to compare.",
      industry: BENCHMARKS.postingDays.guidance,
      action:
        "Start with the industry consensus (Thu–Sun), keep the day consistent for 6–8 uploads, then re-run diagnostics to see if a pattern emerges.",
      sources: [...BENCHMARKS.postingDays.sources],
    });
  }

  // --- Posting time ---
  const timeIns = insight("best-time");
  if (timeIns) {
    const aligned = (BENCHMARKS.postingTime.windows as readonly string[]).some((w) =>
      timeIns.finding.includes(w)
    );
    recs.push({
      id: "time",
      topic: BENCHMARKS.postingTime.topic,
      status: aligned ? "aligned" : "adjust",
      yourData: timeIns.finding,
      industry: BENCHMARKS.postingTime.guidance,
      action: aligned
        ? "Your measured best window matches the studies — keep publishing there."
        : "Your measured window differs from the consensus. Your data wins, but verify it isn't just a few outliers: try the 12–4 PM (audience-local) window for your next several uploads and compare.",
      sources: [...BENCHMARKS.postingTime.sources],
    });
  }

  // --- Title length ---
  const { minChars, maxChars } = BENCHMARKS.titleLength;
  const medTitleLen = Math.round(median(videos.map((v) => v.title.length)));
  const titleAligned = medTitleLen >= minChars && medTitleLen <= maxChars;
  recs.push({
    id: "title",
    topic: BENCHMARKS.titleLength.topic,
    status: titleAligned ? "aligned" : "adjust",
    yourData: `Your median title is ${medTitleLen} characters${
      insight("title-length") ? `; ${insight("title-length")!.finding.toLowerCase()}` : ""
    }.`,
    industry: BENCHMARKS.titleLength.guidance,
    action: titleAligned
      ? "Title length is on target — focus on front-loading the keyword and testing curiosity gaps."
      : medTitleLen > maxChars
        ? `Trim titles toward ${minChars}–${maxChars} characters so they don't truncate in search and suggested feeds.`
        : `Your titles run short — use the extra room (up to ~${maxChars} chars) to add the search keyword and a reason to click.`,
    sources: [...BENCHMARKS.titleLength.sources],
  });

  // --- Hashtags (YouTube only — needs hashtag extraction) ---
  if (platform === "youtube") {
    recs.push(hashtagRecommendation(videos));
  }

  // --- Video length ---
  const durIns = insight("duration");
  const { longFormSweetSpotMin, longFormSweetSpotMax } = BENCHMARKS.videoLength;
  if (durIns && platform === "youtube") {
    recs.push({
      id: "length",
      topic: BENCHMARKS.videoLength.topic,
      status: "aligned",
      yourData: durIns.finding,
      industry: BENCHMARKS.videoLength.guidance,
      action: `Make more videos in your measured sweet spot; if that range is under ${longFormSweetSpotMin} minutes, test stretching your best topics to ${longFormSweetSpotMin}–${longFormSweetSpotMax} min for the watch-time and mid-roll benefits — but only where retention holds.`,
      sources: [...BENCHMARKS.videoLength.sources],
    });
  }

  // --- Upload frequency ---
  if (summary.uploadsPerWeek !== null) {
    const { minPerWeek, maxPerWeek } = BENCHMARKS.uploadFrequency;
    const freq = summary.uploadsPerWeek;
    const freqAligned = freq >= minPerWeek && freq <= maxPerWeek * 2;
    recs.push({
      id: "frequency",
      topic: BENCHMARKS.uploadFrequency.topic,
      status: freq < minPerWeek ? "adjust" : freqAligned ? "aligned" : "adjust",
      yourData: `You average ${freq.toFixed(1)} uploads per week${
        insight("consistency") ? `, but ${insight("consistency")!.finding.toLowerCase()}` : ""
      }.`,
      industry: BENCHMARKS.uploadFrequency.guidance,
      action:
        freq < minPerWeek
          ? "Increase cadence toward at least 1 predictable upload per week — pick a day and hold it."
          : "Cadence is healthy — protect it. A published schedule ('new video every Friday') compounds.",
      sources: [...BENCHMARKS.uploadFrequency.sources],
    });
  }

  // --- Engagement ---
  if (summary.avgEngagementRate !== null) {
    const rate = summary.avgEngagementRate;
    const good = BENCHMARKS.engagement.goodRate;
    recs.push({
      id: "engagement",
      topic: BENCHMARKS.engagement.topic,
      status: rate >= good ? "aligned" : "opportunity",
      yourData: `Your channel averages ${(rate * 100).toFixed(1)}% likes + comments per view.`,
      industry: BENCHMARKS.engagement.guidance,
      action:
        rate >= good
          ? "Engagement is above the healthy threshold — keep prompting interaction in the first hours after upload."
          : "Below the ~4% healthy benchmark: end videos with one specific question, pin a comment, and reply to everything in the first 2 hours.",
      sources: [...BENCHMARKS.engagement.sources],
    });
  }

  // --- Keywords: double-down opportunity from the channel's own data ---
  const kwIns = insight("keywords");
  if (kwIns) {
    recs.push({
      id: "keywords",
      topic: "Winning topics & keywords",
      status: "opportunity",
      yourData: kwIns.finding,
      industry:
        "Keyword-relevant titles and descriptions remain one of the strongest correlations with ranking in YouTube search and suggested videos.",
      action: `Double down: plan your next uploads around these proven topics, and repeat the winning words in the title, the first 100 characters of the description, and as hashtags.`,
      sources: [BENCHMARKS.titleLength.sources[0]],
    });
  }

  // --- Twitch: clips strategy ---
  if (platform === "twitch") {
    const clips = videos.filter((v) => v.kind === "clip");
    const topClip = clips[0];
    recs.push({
      id: "clips",
      topic: BENCHMARKS.twitchClips.topic,
      status: clips.length > 0 ? "opportunity" : "adjust",
      yourData:
        clips.length > 0
          ? `Your top clip ("${topClip.title}") has ${formatViews(topClip.views)} views — your clips show exactly which stream moments resonate.`
          : "No clips found on your channel — you're missing Twitch's main discoverability lever.",
      industry: BENCHMARKS.twitchClips.guidance,
      action:
        clips.length > 0
          ? "Repurpose your top clips as YouTube Shorts / TikToks with searchable titles, and build stream segments around the moments that get clipped."
          : "Enable and encourage clipping (ask viewers, clip your own highlights) and repost the best ones off-platform.",
      sources: [...BENCHMARKS.twitchClips.sources],
    });
  }

  // Order: adjustments first (most actionable), then opportunities, then confirmations
  const order = { adjust: 0, opportunity: 1, aligned: 2 };
  return recs.sort((a, b) => order[a.status] - order[b.status]);
}

function hashtagRecommendation(videos: RankedVideo[]): Recommendation {
  const b = BENCHMARKS.hashtags;
  const withTags = videos.filter((v) => (v.hashtags?.length ?? 0) > 0);
  const share = withTags.length / videos.length;
  const counts = withTags.map((v) => v.hashtags!.length);
  const medCount = Math.round(median(counts));
  const overLimit = videos.filter((v) => (v.hashtags?.length ?? 0) > b.hardLimit);

  let status: Recommendation["status"];
  let yourData: string;
  let action: string;

  if (overLimit.length > 0) {
    status = "adjust";
    yourData = `${overLimit.length} of your videos use more than ${b.hardLimit} hashtags — YouTube ignores every hashtag on those videos.`;
    action = `Cut those videos down to ${b.min}–${b.max} focused hashtags immediately; over ${b.hardLimit} disables them entirely.`;
  } else if (share < 0.3) {
    status = "opportunity";
    yourData = `Only ${Math.round(share * 100)}% of your videos use hashtags.`;
    action = `Add ${b.min}–${b.max} relevant hashtags to every upload — start with your proven winning keywords.`;
  } else {
    // Compare performance of hashtag vs non-hashtag videos
    const noTags = videos.filter((v) => (v.hashtags?.length ?? 0) === 0);
    const liftNote =
      withTags.length >= 3 && noTags.length >= 3
        ? (() => {
            const withMed = median(withTags.map((v) => v.views));
            const withoutMed = median(noTags.map((v) => v.views));
            return withoutMed > 0
              ? ` Videos with hashtags earn ${(withMed / withoutMed).toFixed(1)}× the median views of those without.`
              : "";
          })()
        : "";
    const inRange = medCount >= b.min && medCount <= b.max;
    status = inRange ? "aligned" : "adjust";
    yourData = `${Math.round(share * 100)}% of your videos use hashtags (median ${medCount} per video).${liftNote}`;
    action = inRange
      ? "Hashtag usage is on target — keep them tightly matched to each video's topic."
      : medCount > b.max
        ? `Trim to ${b.min}–${b.max} hashtags per video; beyond that each extra tag dilutes relevance.`
        : `Bump to ${b.min}–${b.max} hashtags per video using your winning keywords.`;
  }

  return {
    id: "hashtags",
    topic: b.topic,
    status,
    yourData,
    industry: b.guidance,
    action,
    sources: [...b.sources],
  };
}
