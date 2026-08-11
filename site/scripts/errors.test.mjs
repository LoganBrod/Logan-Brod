// The app once surfaced `529 {"type":"error","error":{...}}` straight into a
// banner, because an SDK error's `.message` is the status code plus the
// serialised body. These pin the translation.

import assert from "node:assert/strict";
import test from "node:test";
import { APIError, APIConnectionError } from "@anthropic-ai/sdk/error";
import { describeApiError } from "../lib/anthropic.ts";

const headers = new Headers({ "request-id": "req_011CdqvZ" });

/** Build the error the SDK would actually raise for a given status. */
const apiError = (status, type, message = "boom") =>
  APIError.generate(status, { type: "error", error: { type, message } }, undefined, headers);

test("a 529 reads as a sentence, never as JSON", () => {
  const msg = describeApiError(apiError(529, "overloaded_error", "Overloaded"));
  assert.match(msg, /busy right now/i);
  assert.doesNotMatch(msg, /[{}]|overloaded_error|529/, "must not leak the raw body");
});

test("the 529 message says the work is kept, because it is", () => {
  assert.match(describeApiError(apiError(529, "overloaded_error")), /kept/i);
});

test("rate limiting is distinguished from being overloaded", () => {
  const msg = describeApiError(apiError(429, "rate_limit_error"));
  assert.match(msg, /too many requests/i);
  assert.doesNotMatch(msg, /busy right now/i);
});

test("auth and permission failures name what to fix", () => {
  assert.match(describeApiError(apiError(401, "authentication_error")), /ANTHROPIC_API_KEY/);
  assert.match(describeApiError(apiError(403, "permission_error")), /permissions|billing/i);
});

test("a bad request surfaces the API's own explanation — that one is our bug", () => {
  const msg = describeApiError(apiError(400, "invalid_request_error", "max_tokens: too large"));
  assert.match(msg, /max_tokens: too large/);
});

test("connection failures are reported as connection failures", () => {
  // APIConnectionError extends APIError, so it has to be matched first.
  const msg = describeApiError(new APIConnectionError({ message: "socket hang up" }));
  assert.match(msg, /couldn't reach anthropic/i);
});

test("an unmapped API status still gives something actionable and traceable", () => {
  const msg = describeApiError(apiError(500, "api_error"));
  assert.match(msg, /HTTP 500/);
  assert.match(msg, /req_011CdqvZ/, "keeps the request id so a report can be traced");
});

test("our own thrown errors pass through untouched", () => {
  const msg = describeApiError(
    new Error("ANTHROPIC_API_KEY is not configured. Copy .env.local.example to .env.local.")
  );
  assert.match(msg, /not configured/);
});

test("a non-Error never crashes the handler", () => {
  assert.match(describeApiError("just a string"), /something went wrong/i);
  assert.match(describeApiError(undefined), /something went wrong/i);
});
