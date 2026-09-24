// A single-password login for the dashboard when it is on the internet.
//
// DASHBOARD_PASSWORD unset → no login at all (the dashboard on your own computer).
// DASHBOARD_PASSWORD set   → every page and API needs the session cookie, which is an HMAC of a
//                            fixed string keyed with the password. Change the password, and every
//                            phone is logged out. Web Crypto only, so this runs in proxy.ts too.
export const COOKIE = "sos_session";
export const password = () => (process.env.DASHBOARD_PASSWORD ?? "").trim();

export async function sessionToken(): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("school-os session v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAuthed(cookie: string | undefined): Promise<boolean> {
  if (!password()) return true;
  return !!cookie && same(cookie, await sessionToken());
}

export function passwordMatches(given: string): boolean {
  return !!password() && same(given, password());
}

/** Compare in constant time, so response timing says nothing about how close a guess was. */
function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
