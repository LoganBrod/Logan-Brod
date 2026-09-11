// The facts the privacy page and the terms both depend on.
//
// In one file because the two pages repeat each other otherwise, and a policy
// that says ninety days on one page and thirty on another is worse than no
// policy: it proves nobody checked. The retention numbers below are imported
// from the modules that actually enforce them rather than retyped, so a change
// to a TTL changes what the page says about it. That is the whole point of
// this file existing instead of the prose being written twice.

import { SESSION_TTL_SECONDS } from "./accounts";
import { CLOSET_TTL_SECONDS } from "./closet";
import { SEEN_TTL_SECONDS } from "./seen";
import { TASTE_TTL_SECONDS } from "./taste";

/** Who you are reaching. Not a registered company - a person trading as one. */
export const OPERATOR = "LevoZ Labs";
export const CONTACT_EMAIL = "levoz.labs@gmail.com";

/**
 * The floor, as stated in the terms.
 *
 * Thirteen is the usual line and the one most of the internet uses. Somewhere
 * with a higher local floor - much of the EU sets it at sixteen for consenting
 * to data processing - is the reason the terms say "or older if the law where
 * you live says so" rather than just naming a number.
 */
export const MIN_AGE = 13;

/**
 * Where these are governed.
 *
 * Left unset deliberately rather than guessed at: naming the wrong country in
 * a governing-law clause is worse than not having one, and it is a one-word
 * change. Set it and the clause appears; leave it and the page simply doesn't
 * make a claim it cannot support.
 */
export const JURISDICTION: string | null = null;

/** When these were last meaningfully changed. Update by hand when they are. */
export const UPDATED = "11 September 2026";

const days = (seconds: number) => Math.round(seconds / 86_400);

/**
 * What is kept, and for how long, straight from the constants that enforce it.
 *
 * Photographs are deliberately not a row here. They are never written down at
 * all — see the page itself.
 */
export const RETENTION = [
  {
    what: "A saved clozet",
    how: `${days(CLOSET_TTL_SECONDS)} days`,
    why: "The pieces, the price range and the note about why they suit you.",
  },
  {
    what: "What you liked and turned down",
    how: `${days(TASTE_TTL_SECONDS)} days`,
    why: "So the next clozet is better than the last one. Kept against the random cookie id, not against your name.",
  },
  {
    what: "Pieces already shown to you",
    how: `${days(SEEN_TTL_SECONDS)} days`,
    why: "So a second run doesn't hand you back the same jacket.",
  },
  {
    what: "A signed-in session",
    how: `${days(SESSION_TTL_SECONDS)} days`,
    why: "Renewed each time you use it, so staying signed in keeps it alive.",
  },
  {
    what: "Your email address and password",
    how: "Until you ask us to delete it",
    why: "The password is stored as a scrypt hash and cannot be read back, by us or by anybody who takes a copy.",
  },
  {
    what: "Traffic counts",
    how: "90 days",
    why: "Numbers only - how many people, from where. Nothing that can be traced to a person.",
  },
  {
    what: "A bug report you send",
    how: "Until it is dealt with",
    why: "The last 500 are kept; older ones fall off the end.",
  },
] as const;

/**
 * Everything of yours that leaves this server, and why.
 *
 * The list is short on purpose and it is the part of a privacy policy anybody
 * actually wants to read, so it goes near the top of the page rather than in
 * a schedule at the bottom.
 */
export const THIRD_PARTIES = [
  {
    name: "Anthropic",
    what: "The photographs you upload, and the text of your searches.",
    why: "It is the model that reads your photographs and judges what comes back. Anthropic does not train on what is sent through the API.",
  },
  {
    name: "eBay, Google Shopping, and the brands' own shops",
    what: "The search words, which are written from your photographs and never contain anything about you.",
    why: "They are where the listings come from. They do not learn that a search came from you.",
  },
  {
    name: "Upstash",
    what: "Everything in the table above, which is all of what is stored.",
    why: "It is the database. Nothing is stored anywhere else.",
  },
  {
    name: "Resend",
    what: "Your email address, when there is an email to send you.",
    why: "Sign-in links, and a digest if you have asked for one.",
  },
  {
    name: "Railway",
    what: "The ordinary record of a web request, including your IP address.",
    why: "It is where the site runs.",
  },
] as const;
