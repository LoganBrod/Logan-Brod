import Anthropic from "@anthropic-ai/sdk";

/**
 * Opus 5 for every pass. Thinking is ON by default on this model — we
 * deliberately don't disable it, because disabled thinking on Opus 5 can emit a
 * tool call as plain text or leak <thinking> tags into the response. `effort` is
 * the lever for cost instead.
 *
 * That also means `max_tokens` has to cover thinking *and* the response, so the
 * values passed at each call site are generous on purpose.
 *
 * Do not add `temperature`, `top_p`, or `budget_tokens` — all return 400 here.
 */
export const MODEL = "claude-opus-5";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured. Copy .env.local.example to .env.local and fill it in."
      );
    }
    client = new Anthropic();
  }
  return client;
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
