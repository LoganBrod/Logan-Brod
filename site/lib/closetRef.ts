// Which clozet a follow-up is about.
//
// Accessories and colognes both work off a clozet's style profile, and both
// used to reach for `library[0]` - whatever the person built most recently.
// That is the right default and the wrong guarantee. Someone can arrive on the
// accessories page from a link, from the menu, or from the band at the bottom
// of a clozet they built ninety seconds ago, and only in the last case does
// "most recent" reliably mean "the one they're looking at". Two tabs, or a
// clozet built on a phone while an older one is open on a laptop, and the
// fallback quietly matches accessories to the wrong wardrobe.
//
// So the code travels with the link. When it's there, that clozet is the
// answer. When it isn't, the old behaviour stands, because the standalone
// pages still need to work for someone who just opened them.

import { readCloset, type Closet } from "./closet";
import { readLibrary, type Owner } from "./library";

export type ClosetRef =
  | { closet: Closet; explicit: boolean }
  | { closet: null; reason: "none" | "expired" };

/**
 * Resolve the clozet a follow-up should match against.
 *
 * `expired` and `none` are separated because they need different words in
 * front of a person: one means build your first clozet, the other means the
 * one you're pointing at is gone and building another will fix it.
 */
export async function resolveCloset(owner: Owner | null, code?: string | null): Promise<ClosetRef> {
  if (typeof code === "string" && code) {
    const closet = await readCloset(code).catch(() => null);
    // A code that was given and didn't resolve is expired, not absent. Falling
    // back to the newest clozet here would silently answer a different question
    // than the one asked, which is worse than saying the link is stale.
    return closet ? { closet, explicit: true } : { closet: null, reason: "expired" };
  }

  // No owner means nothing has ever been saved for this browser, which is the
  // same answer as an empty library and needs the same words.
  const library = owner ? await readLibrary(owner) : [];
  if (!library[0]) return { closet: null, reason: "none" };

  const closet = await readCloset(library[0].code).catch(() => null);
  return closet ? { closet, explicit: false } : { closet: null, reason: "expired" };
}

/** The message that goes with a miss, so both routes say the same thing. */
export function missMessage(reason: "none" | "expired"): string {
  return reason === "expired"
    ? "That clozet has expired. Build a new one and try again."
    : "Build a clozet first - these are chosen against the style it reads from your photos.";
}
