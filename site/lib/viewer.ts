// Who a request belongs to.
//
// Every route that touches saved work asks this one question, and it has one
// answer with two shapes: an account when you're signed in, and the anonymous
// browser id when you aren't. Both are real identities and both own closets —
// the difference is only that one of them follows you to another device.
//
// Taste is deliberately stored under a single flat id rather than a union, so
// everything in `lib/taste.ts` still takes a plain string and knows nothing
// about accounts. An account's taste id is just its user id with a prefix that
// can't collide with a minted browser id.

import { readSession, type User } from "./accounts";
import { planFor, type Plan } from "./plans";
import { newTasteId, readTasteId } from "./taste";
import type { Owner } from "./library";

export interface Viewer {
  user: User | null;
  /** The anonymous browser id, if this browser has one yet. */
  browserId: string | null;
  /** Who owns closets for this request, or null when nothing identifies it. */
  owner: Owner | null;
  /** The key taste is stored under, or null when there's nowhere to put it. */
  tasteId: string | null;
  /** Free unless an account says otherwise. Anonymous is always free. */
  plan: Plan;
  /** What usage is metered against — the account, or the browser. */
  meterId: string | null;
}

/** Accounts and browsers share a namespace, so account ids are prefixed. */
export function tasteIdFor(owner: Owner): string {
  return owner.kind === "user" ? `u-${owner.id}` : owner.id;
}

export async function readViewer(req: Request): Promise<Viewer> {
  const cookie = req.headers.get("cookie");
  const browserId = readTasteId(cookie);
  const user = await readSession(cookie);

  // Signing in takes precedence over the browser: once there's an account, work
  // belongs to the person rather than to the machine they happen to be at.
  const owner: Owner | null = user
    ? { kind: "user", id: user.id }
    : browserId
      ? { kind: "browser", id: browserId }
      : null;

  return {
    user,
    browserId,
    owner,
    tasteId: owner ? tasteIdFor(owner) : null,
    plan: planFor(user),
    // Metered against the same identity that owns the work, so signing out
    // doesn't reset anyone's month.
    meterId: owner ? tasteIdFor(owner) : null,
  };
}


/**
 * Who is asking, minting a browser id when there isn't one.
 *
 * `readViewer` reports what the request carried, which is the honest answer and
 * the wrong one for a metered route: a first-time visitor carries no cookie, so
 * they have no id, and a meter with no id now refuses. This gives every caller
 * an identity to be counted against — the account's if they have one, the
 * browser's otherwise, new if necessary — and tells the route when that id
 * still needs writing back as a cookie.
 *
 * It is not an anti-abuse measure and cannot be one: anybody can drop the
 * cookie and be minted a fresh id. It exists so honest people are metered
 * correctly. The ceiling that actually protects the balance is in
 * `lib/ratelimit.ts`, which counts against the network address instead.
 */
export async function identify(
  req: Request
): Promise<Viewer & { id: string; mint: string | null }> {
  const viewer = await readViewer(req);
  const existing = readTasteId(req.headers.get("cookie"));
  const browserId = existing ?? newTasteId();
  return {
    ...viewer,
    id: viewer.meterId ?? browserId,
    mint: existing || viewer.user ? null : browserId,
  };
}
