// The parts of analytics the browser is allowed to know.
//
// Split off from `lib/analytics.ts` for the same reason `feedbackKinds` is
// split from `feedback`: the beacon runs in the page, the recorder talks to
// Redis, and an import from one to the other drags the storage layer into the
// browser bundle. Constants and one fetch, no I/O against anything of ours.

/**
 * The funnel, in order.
 *
 * An allowlist rather than free-form event names, and that is a storage
 * decision before it is a taste one: every name here becomes a field in a
 * Redis hash, so a caller who can invent names can inflate a hash without
 * limit. Ten steps is also about the number a person can hold in their head
 * while reading the report, which is the other reason not to have forty.
 */
export const EVENTS = [
  "quiz_start",
  "quiz_done",
  "quiz_skip",
  "upload",
  "run_start",
  "run_done",
  "closet_saved",
  "signup",
  "feedback_sent",
] as const;

export type AnalyticsEvent = (typeof EVENTS)[number];

export function isEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === "string" && (EVENTS as readonly string[]).includes(value);
}

/**
 * The steps the report draws as a funnel, and what to call them.
 *
 * Separate from EVENTS because not every event is a funnel step - `quiz_skip`
 * is a thing worth counting and not a stage anybody passes through.
 */
export const FUNNEL: Array<{ event: AnalyticsEvent | "visit"; label: string }> = [
  { event: "visit", label: "Landed" },
  { event: "quiz_start", label: "Started the quiz" },
  { event: "upload", label: "Uploaded a photo" },
  { event: "run_start", label: "Ran a clozet" },
  { event: "run_done", label: "Got pieces back" },
  { event: "closet_saved", label: "Saved it" },
];

/**
 * Tell the server something happened.
 *
 * `sendBeacon` rather than `fetch`, because half of these fire on the way to
 * somewhere else and a fetch in flight when the page unloads is a fetch that
 * gets cancelled. Falls back to a keepalive fetch where sendBeacon isn't
 * there. Never throws and never returns anything: analytics that can break a
 * page is worse than no analytics.
 */
export function track(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  send({ event });
}

/** A pageview. Carries where they came from, which only the browser knows. */
export function trackView(path: string, entry: { ref?: string; campaign?: string }): void {
  if (typeof window === "undefined") return;
  send({ path, ...entry });
}

function send(body: Record<string, unknown>): void {
  try {
    const json = JSON.stringify(body);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/beacon", new Blob([json], { type: "application/json" }));
      return;
    }
    void fetch("/api/beacon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: json,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A blocked beacon, a full send queue, a browser without either: none of
    // these are the page's problem.
  }
}
