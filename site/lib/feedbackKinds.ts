// The parts of feedback the browser is allowed to know.
//
// Split off for the same reason `accessoryKinds` and `cologneOptions` are: the
// form is a client component, `lib/feedback.ts` talks to Redis, and an import
// from the one to the other drags the storage layer into the browser bundle.
// Constants only, no I/O, safe on both sides.

export const KINDS = ["bug", "idea", "other"] as const;
export type FeedbackKind = (typeof KINDS)[number];

/** Long enough for a real description, short enough to be a known row size. */
export const MAX_MESSAGE = 2000;

export function isKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}
