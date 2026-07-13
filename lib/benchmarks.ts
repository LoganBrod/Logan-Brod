// Curated industry benchmarks for the cross-reference engine, with sources.
// These are the published-consensus numbers the channel's measured data is
// compared against. Live web research (lib/research.ts) supplements these
// when a search API key is configured.

export interface Source {
  name: string;
  url: string;
}

export const SOURCES = {
  youtubeHashtags: {
    name: "YouTube Help — Using hashtags",
    url: "https://support.google.com/youtube/answer/6390658",
  },
  youtubeSearch: {
    name: "YouTube Creators — Search & discovery",
    url: "https://www.youtube.com/creators/how-things-work/content-creation-strategy/",
  },
  backlinko: {
    name: "Backlinko — YouTube ranking factors study",
    url: "https://backlinko.com/youtube-ranking-factors",
  },
  sproutSocial: {
    name: "Sprout Social — Best times to post on YouTube",
    url: "https://sproutsocial.com/insights/best-times-to-post-on-youtube/",
  },
  hootsuite: {
    name: "Hootsuite — Best time to post on YouTube",
    url: "https://blog.hootsuite.com/best-time-to-post-on-youtube/",
  },
  buffer: {
    name: "Buffer — Best time to post on YouTube",
    url: "https://buffer.com/resources/best-time-to-post-on-youtube/",
  },
  vidiq: {
    name: "vidIQ — YouTube upload strategy",
    url: "https://vidiq.com/blog/post/best-time-upload-youtube-videos/",
  },
  twitchAffiliate: {
    name: "Twitch — Growing your community",
    url: "https://help.twitch.tv/s/article/get-started-guide",
  },
} satisfies Record<string, Source>;

export const BENCHMARKS = {
  postingDays: {
    topic: "Best days to publish",
    // Consensus across scheduling studies
    bestDays: ["Thursday", "Friday", "Saturday", "Sunday"],
    guidance:
      "Most cross-channel studies find late week and weekends (Thu–Sun) perform best, since watch time peaks on evenings and weekends.",
    sources: [SOURCES.sproutSocial, SOURCES.hootsuite, SOURCES.buffer],
  },
  postingTime: {
    topic: "Best time of day",
    guidance:
      "Studies converge on publishing in the early-to-mid afternoon (roughly 12–4 PM in your audience's timezone), 2–4 hours before the evening viewing peak, so the algorithm has engagement data by prime time.",
    windows: ["afternoon (12–18 UTC)", "evening (18–24 UTC)"],
    sources: [SOURCES.hootsuite, SOURCES.buffer, SOURCES.vidiq],
  },
  titleLength: {
    topic: "Title length",
    minChars: 40,
    maxChars: 60,
    guidance:
      "Keep titles roughly 40–60 characters with the main keyword up front — long titles get truncated in search and suggested feeds, hurting click-through.",
    sources: [SOURCES.backlinko, SOURCES.youtubeSearch],
  },
  hashtags: {
    topic: "Hashtags",
    min: 2,
    max: 5,
    hardLimit: 15,
    guidance:
      "Use 2–5 focused hashtags. YouTube ignores ALL hashtags on a video that uses more than 15, and over-tagging can reduce relevance.",
    sources: [SOURCES.youtubeHashtags],
  },
  videoLength: {
    topic: "Video length",
    longFormSweetSpotMin: 8,
    longFormSweetSpotMax: 15,
    guidance:
      "Longer videos accumulate more watch time — first-page results average ~10–15 minutes — and 8+ minutes unlocks mid-roll ads. Retention matters more than raw length: only go long if you can hold attention.",
    sources: [SOURCES.backlinko, SOURCES.youtubeSearch],
  },
  uploadFrequency: {
    topic: "Upload frequency",
    minPerWeek: 1,
    maxPerWeek: 3,
    guidance:
      "Consistency beats volume: 1–3 uploads per week on a predictable schedule trains both the audience and the recommendation system.",
    sources: [SOURCES.vidiq, SOURCES.youtubeSearch],
  },
  retention: {
    topic: "Audience retention",
    goodAvgViewPercentage: 50,
    guidance:
      "An average view percentage of 50%+ is a strong signal; below ~35% suggests intros are too long or the content doesn't match the title/thumbnail promise.",
    sources: [SOURCES.youtubeSearch, SOURCES.vidiq],
  },
  engagement: {
    topic: "Engagement rate",
    goodRate: 0.04,
    guidance:
      "A ~4%+ like-and-comment rate per view is healthy. Ask a specific question, pin a comment, and reply early — the first hours of engagement drive recommendations.",
    sources: [SOURCES.backlinko, SOURCES.vidiq],
  },
  twitchClips: {
    topic: "Clips & discoverability",
    guidance:
      "Live-stream platforms have weak in-platform discovery: top streamers grow by clipping stream highlights and reposting to YouTube/Shorts/TikTok. Your most-viewed clips show which moments to repurpose.",
    sources: [SOURCES.twitchAffiliate],
  },
} as const;
