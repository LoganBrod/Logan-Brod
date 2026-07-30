/**
 * The app's public origin, as a third party would reach it.
 *
 * This is not cosmetic: eBay fetches listing photos from URLs built on this
 * value, so if it resolves to something eBay can't reach — a private request
 * host, or localhost — the publish appears to succeed and silently arrives
 * with no images.
 *
 * `PUBLIC_SITE_URL` is authoritative. `RAILWAY_PUBLIC_DOMAIN` is the automatic
 * fallback so a fresh Railway deploy works before a custom domain exists;
 * Railway injects it as a bare hostname with no scheme, which is why it gets
 * one added here rather than being used as-is.
 *
 * @param fallback A request-derived origin to use when neither is configured.
 */
export function publicOrigin(fallback?: string): string {
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  if (explicit) return trimSlashes(explicit);

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    const host = trimSlashes(railway).replace(/^https?:\/\//, "");
    if (host) return `https://${host}`;
  }

  return trimSlashes(fallback ?? "");
}

function trimSlashes(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
