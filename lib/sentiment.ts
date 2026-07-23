// Lightweight lexicon-based sentiment scorer — no external NLP API required.

const POSITIVE_WORDS = new Set([
  "great", "amazing", "fire", "goat", "elite", "clutch", "mvp", "beast", "underrated",
  "steal", "love", "best", "insane", "huge", "breakout", "stud", "legend", "impressive",
  "unstoppable", "dominant", "monster", "special", "phenomenal", "electric",
]);

const NEGATIVE_WORDS = new Set([
  "bust", "overrated", "terrible", "injury", "injured", "washed", "trash", "disappointing",
  "bad", "worst", "decline", "struggling", "benched", "cut", "waived", "hurt", "slump",
  "awful", "concerning", "regression", "flop",
]);

export interface SentimentResult {
  score: number; // -1 (negative) .. 1 (positive)
  positive: number;
  negative: number;
}

export function scoreSentiment(text: string): SentimentResult {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  let positive = 0;
  let negative = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) positive++;
    if (NEGATIVE_WORDS.has(w)) negative++;
  }
  const total = positive + negative;
  const score = total === 0 ? 0 : (positive - negative) / total;
  return { score, positive, negative };
}
