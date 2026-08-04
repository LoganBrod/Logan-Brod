/**
 * Turns a transcript into a spoken answer.
 *
 * This is deliberately a keyword matcher over what is already in memory/, not
 * a language model. It is the placeholder for the Claude API step, and it is
 * honest about being one: anything it does not recognise gets "I can't answer
 * that yet", never an improvised reply.
 *
 * That matters more than it sounds. The whole workspace exists so the
 * assistant does not fabricate things about Logan's businesses, and a voice
 * interface that guesses would undo it — spoken answers carry more authority
 * than written ones and leave no transcript to check.
 */

import type { Business, Decision, OpenQuestion } from "./memory";

export interface Snapshot {
  businesses: Business[];
  questions: OpenQuestion[];
  decisions: Decision[];
}

export interface Answer {
  text: string;
  /** False when nothing matched — the UI shows these differently. */
  understood: boolean;
}

const list = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

export function respond(transcript: string, snapshot: Snapshot): Answer {
  const text = transcript.toLowerCase().trim();
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  if (has("time", "what time")) {
    return {
      understood: true,
      text: `It's ${new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}.`,
    };
  }

  if (has("open question", "stuck", "unresolved", "questions")) {
    const { questions } = snapshot;
    if (questions.length === 0) {
      return { understood: true, text: "Nothing unresolved right now." };
    }
    const top = questions.slice(0, 3).map((q) => q.question);
    return {
      understood: true,
      text: `${plural(questions.length, "open question")}. The first three: ${list(top)}`,
    };
  }

  if (has("bottleneck", "blocking", "blocked")) {
    const known = snapshot.businesses.filter(
      (b) => b.bottleneck && !/^unknown/i.test(b.bottleneck),
    );
    if (known.length === 0) {
      return {
        understood: true,
        // Says the gap out loud rather than inventing a bottleneck.
        text: "No bottleneck is recorded yet. You haven't told me what it is.",
      };
    }
    return {
      understood: true,
      text: known.map((b) => `${b.name}: ${b.bottleneck}`).join(". "),
    };
  }

  if (has("project", "business", "working on")) {
    const { businesses } = snapshot;
    if (businesses.length === 0) {
      return { understood: true, text: "No projects are recorded yet." };
    }
    return {
      understood: true,
      text: `${plural(businesses.length, "project")}: ${list(
        businesses.map((b) => `${b.name}, ${b.stage || "stage unknown"}`),
      )}`,
    };
  }

  if (has("decision", "decided", "recent")) {
    const { decisions } = snapshot;
    if (decisions.length === 0) {
      return { understood: true, text: "Nothing logged yet." };
    }
    return {
      understood: true,
      text: `Most recent: ${decisions
        .slice(0, 2)
        .map((d) => d.decision)
        .join(". Before that: ")}`,
    };
  }

  if (has("hello", "hey jarvis", "you there", "are you")) {
    return { understood: true, text: "I'm here." };
  }

  return {
    understood: false,
    text: "I can't answer that yet — I only know what's in memory. Ask about projects, open questions, bottlenecks or decisions.",
  };
}
