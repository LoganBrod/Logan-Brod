// Password hashing.
//
// scrypt, from the standard library. bcrypt and argon2 are both fine choices
// and both are native modules — an extra build step, a compile on every deploy,
// and a dependency that can fail to install on a platform you didn't test. Node
// ships scrypt (RFC 7914), it is a deliberately memory-hard KDF designed for
// exactly this, and it needs nothing installed.
//
// Never store a password. Never log one. Never put one in an error message.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/**
 * scrypt needs 128 * N * r bytes, and Node caps it at 32MB unless told
 * otherwise — which the parameters below exceed. The limit exists to stop a
 * caller accidentally asking for gigabytes, so it's raised deliberately to
 * exactly twice what these parameters need rather than removed.
 */
function derive(
  password: string,
  salt: Buffer,
  keylen: number,
  params: { N: number; r: number; p: number }
): Promise<Buffer> {
  return scryptAsync(password, salt, keylen, {
    ...params,
    maxmem: 256 * params.N * params.r,
  });
}

/**
 * Cost parameters. N is the work factor — doubling it doubles both time and
 * memory. 2^15 lands around a tenth of a second on typical serverless hardware,
 * which is slow enough to make guessing expensive and fast enough that signing
 * in doesn't feel broken.
 *
 * These are recorded in the stored hash, so raising them later doesn't
 * invalidate existing passwords: old hashes keep verifying with the parameters
 * they were made with.
 */
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** Long enough to matter. Length beats composition rules, which mostly produce Passw0rd!. */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * An upper bound, because hashing cost scales with input and an unbounded
 * password field is a way to make the server do arbitrary work.
 */
const MAX_PASSWORD_LENGTH = 200;

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "A password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters — length matters more than symbols.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return "That password is too long.";
  return null;
}

/** `scrypt$N$r$p$salt$hash`, everything base64. Self-describing, so parameters can change. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Check a password against a stored hash.
 *
 * Compared with `timingSafeEqual` rather than `===`: a byte-by-byte comparison
 * that returns early leaks, in its own duration, how much of the hash was
 * right. It's a narrow attack and it costs one function call to close.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, salt, hash] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const params = { N: Number(n), r: Number(r), p: Number(p) };
    if (!(params.N > 1) || !(params.r > 0) || !(params.p > 0)) return false;

    const expected = Buffer.from(hash ?? "", "base64");
    // A stored record with an empty hash must never match. Two zero-length
    // buffers are equal, and timingSafeEqual says so — which would turn a
    // truncated or corrupted row into a password that accepts anything.
    if (expected.length < 16) return false;
    const actual = await derive(password, Buffer.from(salt ?? "", "base64"), expected.length, params);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    // A malformed stored hash is a failed sign-in, not a crash.
    return false;
  }
}

/**
 * Burn the same time as a real check, for an address that has no account.
 *
 * Without this, "no such user" returns instantly and "wrong password" takes a
 * tenth of a second — which turns the sign-in form into a way to ask whether
 * someone has an account here. For a clothes-shopping app that's a small
 * disclosure, but it's free to not make it.
 */
export async function fakeVerify(password: string): Promise<false> {
  await derive(password, randomBytes(SALT_LENGTH), KEY_LENGTH, PARAMS);
  return false;
}
