// What people tell us is wrong.
//
// A beta with no way to report a bug is a beta that finds out about its bugs
// from people who have already left. This is the cheapest possible version of
// the thing: one Redis list, newest first, read back by one authenticated
// route. No ticketing, no email, no third party.
//
// Everything stored here is typed by a stranger, so every field is bounded on
// the way in and nothing is ever interpolated into HTML on the way out — the
// report page renders it as text. The cap is on the list as a whole rather
// than per person: a list that can only grow to a known length cannot be used
// to fill storage, whoever is writing to it.

import { isKind, MAX_MESSAGE, type FeedbackKind } from "./feedbackKinds";
import { listRange, pipeline, redisConfigured } from "./redis";

export { KINDS, MAX_MESSAGE, isKind } from "./feedbackKinds";
export type { FeedbackKind } from "./feedbackKinds";

export interface Feedback {
  kind: FeedbackKind;
  message: string;
  /** How to reach them back, if they offered. Never required. */
  contact?: string;
  /** Which page they were on, so a bug report has a location. */
  path?: string;
  /** The closet they were looking at, when there was one. */
  code?: string;
  at: string;
}

const KEY = "feedback:inbox";

/** Long enough to be a backlog, short enough to be a known quantity. */
export const MAX_STORED = 500;
const MAX_CONTACT = 120;
const MAX_PATH = 200;

/**
 * Read a submission out of a request body.
 *
 * Returns the reason rather than throwing, because every reason here is
 * something to show the person who typed it.
 */
export function parseFeedback(
  body: unknown,
  context: { path?: string; code?: string } = {}
): Feedback | { error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;

  const kind = isKind(raw.kind) ? raw.kind : "other";

  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) return { error: "Tell us what happened first." };
  if (message.length > MAX_MESSAGE) {
    return { error: `That's longer than we can store - keep it under ${MAX_MESSAGE} characters.` };
  }

  const contact = typeof raw.contact === "string" ? raw.contact.trim().slice(0, MAX_CONTACT) : "";
  const path = typeof raw.path === "string" ? raw.path.trim().slice(0, MAX_PATH) : "";

  return {
    kind,
    message,
    ...(contact ? { contact } : {}),
    ...(path || context.path ? { path: (path || context.path)!.slice(0, MAX_PATH) } : {}),
    ...(context.code ? { code: context.code } : {}),
    at: new Date().toISOString(),
  };
}

/**
 * Store one report.
 *
 * Pushed and trimmed in a single pipeline, so the list cannot sit over its cap
 * between two round trips — with fifty people arriving at once that gap is
 * exactly when it would.
 */
export async function recordFeedback(entry: Feedback): Promise<boolean> {
  if (!redisConfigured()) return false;
  try {
    await pipeline([
      ["LPUSH", KEY, JSON.stringify(entry)],
      ["LTRIM", KEY, 0, MAX_STORED - 1],
    ]);
    return true;
  } catch {
    return false;
  }
}

/** The backlog, newest first. Read by the admin route and nothing else. */
export async function readFeedback(limit = 100): Promise<Feedback[]> {
  if (!redisConfigured()) return [];
  try {
    const rows = await listRange(KEY, 0, Math.max(0, limit - 1));
    return rows
      .map((row) => {
        try {
          return JSON.parse(row) as Feedback;
        } catch {
          return null;
        }
      })
      .filter((row): row is Feedback => Boolean(row) && typeof row?.message === "string");
  } catch {
    return [];
  }
}
