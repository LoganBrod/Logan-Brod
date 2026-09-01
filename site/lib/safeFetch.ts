// Fetching a URL somebody else chose, without letting them aim it inward.
//
// Three places in this app fetch a URL that did not come from us: the listing
// link a person pastes into "is this any good?", the product photos behind
// every marketplace result, and the pages a size-guide search turns up. Every
// one of those is a server-side request forgery surface - the classic attack is
// a URL that looks public and resolves, or redirects, to something inside the
// network: a cloud metadata endpoint, a Redis port, an internal admin page.
//
// `fetchableUrl` used to be the whole defence, and it checked exactly one
// thing: the hostname *as written*. Two holes:
//
//   1. It only rejected literal private IPs. A hostname whose A record points
//      at 169.254.169.254 sailed through, because "metadata.evil.com" is not a
//      dotted quad. IPv6 forms were barely handled at all.
//   2. Every call site used `redirect: "follow"`. The check ran once, on the
//      URL that was given, and never on the URL the server was actually sent
//      to. A public page that 302s to an internal address is the standard way
//      past a hostname allowlist, and it worked here.
//
// This closes both. The hostname is resolved first and *every* address it
// resolves to has to be public; then redirects are followed by hand, and each
// hop is put through the same check before it is fetched.
//
// What it does not close: DNS rebinding, where a name resolves public for our
// check and private for the fetch a moment later. Defending that means pinning
// the resolved address and fetching by IP with a Host header, which breaks TLS
// certificate validation and is more machinery than this app's threat model
// justifies. It is a real residual risk and it is named here on purpose.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** How many redirects to follow before giving up. Product pages rarely need one. */
const MAX_HOPS = 3;

/**
 * The URL, if it is public http(s) *by its written form*. Synchronous - no
 * network - so it can gate cheaply before anything is resolved.
 *
 * The WHATWG parser already canonicalises the numeric tricks (`0x7f000001`,
 * `2130706433`, `0177.0.0.1` all come out as `127.0.0.1`), so checking the
 * parsed hostname with `isIP` catches those without a regex for each.
 */
export function publicUrl(raw: string): URL | null {
  const url = publicForm(raw);
  if (!url) return null;
  // Literal addresses are judged here as well as in `resolvesPublic`, so a
  // route can answer 400 to `http://127.0.0.1/` synchronously instead of
  // paying for a fetch attempt that was always going to be refused.
  const literal = stripBrackets(url.hostname);
  if (isIP(literal) && isPrivateAddress(literal)) return null;
  return url;
}

/**
 * The form checks alone: scheme, credentials, and the names that always mean
 * "this machine". Says nothing about *where* the host points - that is the
 * resolver's job, for literal addresses and DNS names alike, which is what
 * lets `safeFetch` treat both the same way and lets a test replace one
 * function to point a fixture at loopback.
 */
export function publicForm(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Credentials in a URL are never legitimate here and are a phishing tell.
  if (url.username || url.password) return null;

  const host = url.hostname.toLowerCase();
  if (!host) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return null;
  if (host.endsWith(".local") || host.endsWith(".arpa")) return null;

  return url;
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
}

/** Private, loopback, link-local, CGNAT, and the unspecified address. */
function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  // Multicast and reserved: nothing we want lives there.
  if (a >= 224) return true;
  return false;
}

/**
 * The same question for IPv6. Handles the mapped and NAT64 forms that carry an
 * IPv4 address inside them, because `[::ffff:127.0.0.1]` is loopback however
 * it is spelled.
 */
function privateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  // Unique local fc00::/7 and link-local fe80::/10.
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  // IPv4-mapped ::ffff:a.b.c.d or ::ffff:aabb:ccdd
  const mapped = lower.match(/^::ffff:(.+)$/);
  if (mapped) {
    const tail = mapped[1];
    if (isIP(tail) === 4) return privateV4(tail);
    const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return privateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return true;
  }
  // NAT64 well-known prefix: treat as internal, it is never a public web host.
  if (lower.startsWith("64:ff9b:")) return true;
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return privateV4(ip);
  if (kind === 6) return privateV6(ip);
  // Not an address at all: refuse rather than guess.
  return true;
}

/**
 * Whether a hostname resolves *only* to public addresses.
 *
 * All of them, not the first: a name with one public A record and one private
 * one is the attack, and which one the fetch picks is not ours to control.
 */
export async function resolvesPublic(hostname: string): Promise<boolean> {
  const literal = stripBrackets(hostname);
  if (isIP(literal)) return !isPrivateAddress(literal);
  try {
    const addresses = await lookup(literal, { all: true });
    return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

/**
 * Fetch a URL that somebody else chose.
 *
 * Returns null - never throws - for anything that is not a public destination
 * at every hop, and for any network failure. Callers already treat a missing
 * page as an ordinary outcome, so this slots in where `fetch` was.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  /**
   * The DNS check, replaceable so the redirect logic can be tested without a
   * network. Nothing in the app passes this; it is the test's seam, and it is
   * a parameter rather than a module-level override so a test cannot leave the
   * real check switched off for whatever runs after it.
   */
  { resolve = resolvesPublic }: { resolve?: (hostname: string) => Promise<boolean> } = {}
): Promise<Response | null> {
  // Form first, then the address through `resolve` - which judges literal IPs
  // as well as names, so this is one rule applied to both.
  let current = publicForm(raw);
  if (!current) return null;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!(await resolve(current.hostname))) return null;

    let res: Response;
    try {
      res = await fetch(current, { ...init, redirect: "manual" });
    } catch {
      return null;
    }

    const location = res.headers.get("location");
    const redirected = res.status >= 300 && res.status < 400 && location;
    if (!redirected) return res;

    // The body of a redirect is never wanted; releasing it keeps the socket
    // from being held open while the next hop is checked.
    await res.body?.cancel().catch(() => {});

    let next: URL | null;
    try {
      // Form only; the hop's address is judged by `resolve` at the top of the
      // next iteration, same as the first URL was.
      next = publicForm(new URL(location, current).toString());
    } catch {
      return null;
    }
    if (!next) return null;
    current = next;
  }

  return null;
}
