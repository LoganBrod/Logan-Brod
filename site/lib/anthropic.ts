import Anthropic from "@anthropic-ai/sdk";

/**
 * Thinking is ON by default on these models — we deliberately don't disable it,
 * because disabled thinking on Opus 5 can emit a tool call as plain text or leak
 * <thinking> tags into the response. `effort` is the lever within a model.
 *
 * That also means `max_tokens` has to cover thinking *and* the response, so the
 * values passed at each call site are generous on purpose.
 *
 * Do not add `temperature`, `top_p`, or `budget_tokens` — all return 400 here.
 */
const OPUS = "claude-opus-5";
const SONNET = "claude-sonnet-5";

/**
 * Which model does which job.
 *
 * Every pass used to be Opus 5, which was the right way to start — you find out
 * what the app needs by giving it the best model and then taking things away —
 * and the wrong way to run it. Opus is $5/$25 per million tokens against
 * Sonnet's $2/$10, and the work here is not uniformly hard. Curation alone is
 * six calls carrying ninety-six product photographs, so it sets the price of a
 * run almost single-handedly, and what it is actually doing is looking at a
 * picture and answering "is this a men's waxed jacket, and does it suit him" —
 * a judgement Sonnet makes as well as Opus.
 *
 * The exception is `fit`. Reading several pages of scraped HTML, finding the
 * measurement table in them and matching it against a person's chest and inseam
 * is the one genuinely hard piece of reasoning in the app, and getting it wrong
 * means telling somebody to buy a jacket that won't fit. It also runs once per
 * brand and is cached for weeks, so it is the cheapest place to keep Opus and
 * the most expensive place to lose accuracy.
 *
 * Deliberately NOT routed to Haiku: a cheap first pass that throws out the
 * obvious junk before an expensive one judges the rest. The images have to be
 * sent to both models, so it saves less than it looks like it does, and the
 * thing it would be doing — discarding candidates before anything good has
 * looked at them — is the exact failure this app has just been fixed for.
 */
export const MODELS = {
  /** Reading the uploads into a profile and a set of searches. */
  analyze: SONNET,
  /** Judging candidates against those uploads. Six calls a run; the price setter. */
  curate: SONNET,
  /** One photo, one verdict, answered while someone stands in a shop. */
  judge: SONNET,
  /** Reading a batch of wardrobe photos into named garments. */
  wardrobeRead: SONNET,
  /** Putting owned pieces together into outfits. */
  outfits: SONNET,
  /** Reading a brand's real size chart. The hardest reasoning here, and cached. */
  fit: OPUS,
} as const;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured. Copy .env.local.example to .env.local and fill it in."
      );
    }
    client = new Anthropic({
      // Default is 2. A 529 "overloaded" is Anthropic being momentarily busy
      // and usually clears in seconds, so it's worth riding out rather than
      // failing a run that has already paid for a vision pass. The SDK backs
      // off exponentially with jitter and honours `retry-after`.
      maxRetries: 5,
    });
  }
  return client;
}

interface SdkErrorShape {
  status?: number;
  type?: string | null;
  requestID?: string | null;
  error?: { error?: { message?: string } };
}

/**
 * Recognise an SDK error by its shape rather than by `instanceof`.
 *
 * Class identity is not reliable here: the SDK ships both CJS and ESM builds,
 * so a caller that resolves a different one than this module holds a different
 * `APIError` object and every `instanceof` silently returns false — which sends
 * the raw JSON straight back out. `constructor.name` is no better, since the
 * production minifier can mangle it. Property names survive both, and every SDK
 * error carries these whether or not a response ever arrived.
 */
function asSdkError(err: Error): SdkErrorShape | null {
  if (!("status" in err) || !("requestID" in err)) return null;
  return err as unknown as SdkErrorShape;
}

/**
 * Turn an SDK exception into something a person can act on.
 *
 * Without this, routes return `err.message`, which for an API error is the
 * status code followed by the serialised response body — the user sees
 * `529 {"type":"error","error":{...}}` in a banner and can do nothing with it.
 *
 * Note 529 arrives as the SDK's `InternalServerError` because it groups every
 * 5xx, so the overload case is identified by status and type.
 */
export function describeApiError(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong. Please try again.";

  const api = asSdkError(err);

  // An SDK error with no status never reached the API — DNS, TLS, socket.
  if (api && typeof api.status !== "number") {
    return "Couldn't reach Anthropic. Check your connection and try again.";
  }

  if (api) {
    const trace = api.requestID ? ` (request ${api.requestID})` : "";

    if (api.status === 529 || api.type === "overloaded_error") {
      return "Anthropic's API is busy right now. Wait a moment and try again — your photos and search results are kept.";
    }
    if (api.status === 429) {
      return "That's too many requests in a row. Wait a minute, then try again.";
    }
    if (api.status === 401) {
      return "ANTHROPIC_API_KEY is missing or invalid. Check it in your environment variables.";
    }
    if (api.status === 403) {
      return "That API key can't use this model. Check the key's permissions and that billing is set up.";
    }
    if (api.status === 400) {
      // A malformed request is our bug, so surface the API's own explanation
      // rather than hiding it behind a friendly line.
      return `The request was rejected: ${api.error?.error?.message ?? "invalid request"}.${trace}`;
    }

    return `Anthropic returned an error (HTTP ${api.status}). Please try again.${trace}`;
  }

  // Our own thrown errors — missing key, refusal, empty structured output —
  // are already written for a person.
  return err.message;
}

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Safety classifiers can decline a request with a 200 and an empty/partial
 * body, so every pass checks this before touching `parsed_output`. Without it a
 * refusal surfaces as a confusing "cannot read property of null".
 */
export function assertNotRefused(
  message: { stop_reason?: string | null; stop_details?: unknown },
  pass: string
): void {
  if (message.stop_reason === "refusal") {
    const details = message.stop_details as { category?: string } | null | undefined;
    throw new Error(
      `Claude declined the ${pass} request${details?.category ? ` (${details.category})` : ""}. Try different photos.`
    );
  }
}

/** `parsed_output` is null when the model hit max_tokens mid-object. */
export function requireParsed<T>(parsed: T | null | undefined, pass: string): T {
  if (parsed == null) {
    throw new Error(
      `Claude returned no structured output for the ${pass} pass. This usually means max_tokens was too low.`
    );
  }
  return parsed;
}
