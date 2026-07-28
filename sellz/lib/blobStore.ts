import { getStore, type Store } from "@netlify/blobs";

/**
 * Whether we're running somewhere Netlify Blobs is available. `NETLIFY` isn't
 * reliably set inside this Next.js runtime, so detect via the values that
 * actually are present at request time. Locally none of these exist and
 * callers fall back to the filesystem.
 */
export const useBlobs = Boolean(
  process.env.SITE_ID || process.env.NETLIFY_SITE_ID || process.env.NETLIFY_BLOBS_CONTEXT
);

/**
 * Open a blob store.
 *
 * Netlify injects everything getStore() needs at request time, so that path
 * is tried FIRST. An explicit siteID + personal access token is only a
 * fallback for when that injection isn't happening — getting this precedence
 * backwards meant a stale or revoked token broke storage on a site whose
 * automatic config was perfectly healthy, surfacing as a blanket 403.
 */
export type CredentialMode = "auto" | "manual";

/**
 * Which credentials to use, as a pure function of the environment so the
 * precedence can be asserted in isolation.
 */
export function credentialMode(env: NodeJS.ProcessEnv = process.env): CredentialMode {
  if (env.NETLIFY_BLOBS_CONTEXT) return "auto";
  const siteID = env.SITE_ID || env.NETLIFY_SITE_ID;
  if (siteID && env.NETLIFY_BLOBS_TOKEN) return "manual";
  return "auto";
}

export function openStore(name: string): Store {
  const opts = { name, consistency: "strong" as const };

  if (credentialMode() === "manual") {
    return getStore({
      ...opts,
      siteID: (process.env.SITE_ID || process.env.NETLIFY_SITE_ID)!,
      token: process.env.NETLIFY_BLOBS_TOKEN!,
    });
  }
  return getStore(opts);
}

/** Turn an opaque Blobs failure into something actionable. */
export function describeBlobError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("403")) {
    return (
      "Netlify Blobs rejected the request (403). This usually means the " +
      "NETLIFY_BLOBS_TOKEN environment variable holds an expired or revoked " +
      "personal access token — deleting that variable lets Netlify's built-in " +
      "credentials take over. Original error: " +
      msg
    );
  }
  return msg;
}
