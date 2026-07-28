/**
 * fetch + JSON parse that degrades readably.
 *
 * Serverless hosts return an HTML error page when a function times out or
 * crashes. Calling .json() on that throws "Unexpected token '<'", which tells
 * the user nothing. This turns those cases into a real explanation.
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error("Couldn't reach the server — check your connection and try again.");
  }

  const text = await res.text();
  const looksLikeHtml = /^\s*<(!doctype|html)/i.test(text);

  if (looksLikeHtml) {
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      throw new Error(
        "That took too long and the server gave up. Try again with fewer or smaller photos."
      );
    }
    throw new Error(`The server returned an error page (HTTP ${res.status}).`);
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Unexpected response from the server (HTTP ${res.status}).`);
    }
  }

  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}
