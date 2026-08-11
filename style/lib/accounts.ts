// Accounts, sessions, and sign-in links.
//
// There are no passwords here, and deliberately so: a password is a thing to
// store, leak, reset, and reuse from somewhere else. Signing in means proving
// you can read an email, which for an app that remembers what clothes you like
// is the right amount of ceremony.
//
// Everything is optional. Without Redis there are no accounts; without an email
// provider there is no sign-in link. In both cases the app runs exactly as it
// did before any of this existed — anonymously, keyed off the browser — which
// is the same posture as saving and as the taste memory.

import { createHash, randomBytes } from "node:crypto";
import { bump, deleteKey, expire, getJson, redisConfigured, setJson, takeJson } from "./redis";
import { fakeVerify, hashPassword, verifyPassword } from "./passwords";

export const SESSION_COOKIE = "sid";

/** A month. Refreshed on use, so an active person is never signed out. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * How long a sign-in link is good for.
 *
 * Long enough to walk to another device and find the email, short enough that a
 * link sitting in an inbox months later is worthless.
 */
export const LOGIN_TTL_SECONDS = 15 * 60;

/** Sign-in emails per address per hour. Enough for a few honest retries. */
const LOGIN_REQUESTS_PER_HOUR = 5;

/**
 * Password attempts per address per fifteen minutes.
 *
 * Generous for someone who genuinely can't remember, and useless for guessing:
 * even a hundred attempts an hour against one address gets nowhere, and the
 * hashing cost means each one is paid for in CPU as well.
 */
const PASSWORD_ATTEMPTS = 10;
const PASSWORD_WINDOW_SECONDS = 15 * 60;

export interface User {
  id: string;
  email: string;
  createdAt: string;
  /** Absent for accounts that have only ever signed in by link. */
  passwordHash?: string;
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Email addresses become part of a Redis key, so they're hashed rather than
 * embedded — it fixes the length, avoids every quoting question, and means the
 * key space carries no addresses in the clear.
 */
function emailKey(email: string): string {
  return `user:email:${createHash("sha256").update(normalizeEmail(email)).digest("hex")}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately loose. Address syntax is far stranger than most patterns allow,
 * and the real proof of an address is that a link sent to it comes back — so
 * this only rejects what obviously can't be delivered.
 */
export function looksLikeEmail(email: string): boolean {
  const clean = normalizeEmail(email);
  return clean.length >= 5 && clean.length <= 254 && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(clean);
}

export function accountsConfigured(): boolean {
  return redisConfigured();
}

// ------------------------------------------------------------------- users

export async function findUserByEmail(email: string): Promise<User | null> {
  const id = await getJson<string>(emailKey(email));
  return id ? getJson<User>(`user:${id}`) : null;
}

export async function readUser(id: string): Promise<User | null> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(id)) return null;
  return getJson<User>(`user:${id}`);
}

/**
 * Find the account for an address, or make one.
 *
 * There is no separate sign-up: the first time an address proves itself, it
 * gets an account. A distinct registration step would only exist to tell people
 * they already have one.
 */
export async function upsertUser(email: string): Promise<User> {
  const existing = await findUserByEmail(email);
  if (existing) return existing;

  const user: User = {
    id: token().slice(0, 32),
    email: normalizeEmail(email),
    createdAt: new Date().toISOString(),
  };

  // The address index has no expiry — an account outlives any session.
  await setJson(`user:${user.id}`, user);
  await setJson(emailKey(email), user.id);
  return user;
}

// ---------------------------------------------------------------- sessions

export function readSessionToken(cookieHeader: string | null): string | null {
  const raw = cookieHeader?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  const value = decodeURIComponent(raw);
  return /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null;
}

export async function startSession(userId: string): Promise<string> {
  const sid = token();
  await setJson(`session:${sid}`, userId, SESSION_TTL_SECONDS);
  return sid;
}

/** The signed-in user, or null. Renews the session, so being active keeps you in. */
export async function readSession(cookieHeader: string | null): Promise<User | null> {
  if (!redisConfigured()) return null;
  const sid = readSessionToken(cookieHeader);
  if (!sid) return null;

  try {
    const userId = await getJson<string>(`session:${sid}`);
    if (!userId) return null;

    await expire(`session:${sid}`, SESSION_TTL_SECONDS).catch(() => {
      // A failed renewal costs a month, not a session.
    });
    return readUser(userId);
  } catch {
    // Never let a storage hiccup log someone out mid-run.
    return null;
  }
}

export async function endSession(cookieHeader: string | null): Promise<void> {
  const sid = readSessionToken(cookieHeader);
  if (sid) await deleteKey(`session:${sid}`).catch(() => {});
}

export function sessionCookie(sid: string, maxAge = SESSION_TTL_SECONDS): string {
  return [
    `${SESSION_COOKIE}=${sid}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

// ------------------------------------------------------------ sign-in links

interface LoginToken {
  email: string;
  /** The browser that asked, so its anonymous work can be adopted on arrival. */
  tasteId?: string;
  at: string;
}

export interface LoginRequest {
  /** The link to send. Never logged in production, never returned to the browser. */
  url: string;
  token: string;
}

/**
 * Mint a sign-in link.
 *
 * Rate limited per address, because the person who receives these emails is not
 * the person who can ask for them — anyone can type someone else's address into
 * the form, and the cost of that landing in an inbox repeatedly is borne by
 * someone who didn't do anything.
 */
export async function createLoginLink(
  email: string,
  origin: string,
  tasteId?: string | null
): Promise<LoginRequest | { rateLimited: true }> {
  const attempts = await bump(`rate:login:${emailKey(email)}`, 60 * 60);
  if (attempts > LOGIN_REQUESTS_PER_HOUR) return { rateLimited: true };

  const value = token();
  const record: LoginToken = {
    email: normalizeEmail(email),
    tasteId: tasteId ?? undefined,
    at: new Date().toISOString(),
  };
  await setJson(`login:${value}`, record, LOGIN_TTL_SECONDS);

  return {
    token: value,
    url: `${origin}/api/auth/callback?token=${encodeURIComponent(value)}`,
  };
}

/**
 * Spend a sign-in link and return who it belonged to.
 *
 * Single-use through GETDEL: the read and the delete are one operation, so two
 * clicks on the same link race and exactly one wins. A link that has been used,
 * expired, or never existed all return null — they're the same thing from here.
 */
export async function consumeLoginLink(
  value: string
): Promise<{ user: User; tasteId?: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(value)) return null;

  const record = await takeJson<LoginToken>(`login:${value}`);
  if (!record?.email) return null;

  const user = await upsertUser(record.email);
  return { user, tasteId: record.tasteId };
}

// ------------------------------------------------------------------ passwords

/** Give an account a password, or change the one it has. */
export async function setPassword(userId: string, password: string): Promise<void> {
  const user = await readUser(userId);
  if (!user) throw new Error("No such account.");
  await setJson(`user:${user.id}`, { ...user, passwordHash: await hashPassword(password) });
}

export type SignInResult =
  | { ok: true; user: User }
  | { ok: false; reason: "wrong" | "no-password" | "rate-limited" };

/**
 * Sign in with an address and a password.
 *
 * Every failure path returns the same "wrong" to the caller, and the address
 * that has no account still pays the cost of a hash — so neither the message
 * nor the timing says whether an account exists. The one exception is an
 * account that exists and has never set a password, which has to be
 * distinguishable or there'd be no way to tell someone to use a link instead.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<SignInResult> {
  const attempts = await bump(`rate:pw:${emailKey(email)}`, PASSWORD_WINDOW_SECONDS);
  if (attempts > PASSWORD_ATTEMPTS) return { ok: false, reason: "rate-limited" };

  const user = await findUserByEmail(email);
  if (!user) {
    await fakeVerify(password);
    return { ok: false, reason: "wrong" };
  }
  if (!user.passwordHash) return { ok: false, reason: "no-password" };

  const correct = await verifyPassword(password, user.passwordHash);
  return correct ? { ok: true, user } : { ok: false, reason: "wrong" };
}

/** Create an account with a password. Fails if the address is already taken. */
export async function registerWithPassword(
  email: string,
  password: string
): Promise<{ ok: true; user: User } | { ok: false; reason: "taken" }> {
  if (await findUserByEmail(email)) return { ok: false, reason: "taken" };

  const user = await upsertUser(email);
  await setPassword(user.id, password);
  return { ok: true, user: (await readUser(user.id))! };
}
