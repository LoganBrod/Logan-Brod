// Offline checks for closet-code handling. The Redis-backed paths need real
// credentials and are covered by the manual steps in style/README.md.

import assert from "node:assert/strict";
import test from "node:test";
import { isValidCode, normalizeCode } from "../lib/closet.ts";

test("normalizeCode forgives how people actually type a code", () => {
  assert.equal(normalizeCode("  abc-234 "), "ABC234");
  assert.equal(normalizeCode("ABC234"), "ABC234");
});

test("valid codes round-trip through normalize", () => {
  assert.ok(isValidCode(normalizeCode("wxyz89")));
});

test("ambiguous characters are not valid code characters", () => {
  // 0/O/1/I/L are excluded from the alphabet precisely so they can't be
  // confused when a code is read aloud or retyped.
  for (const code of ["ABC0EF", "ABCOEF", "ABC1EF", "ABCIEF", "ABCLEF"]) {
    assert.equal(isValidCode(code), false, `${code} should be rejected`);
  }
});

test("wrong-length codes are rejected", () => {
  assert.equal(isValidCode("ABC23"), false);
  assert.equal(isValidCode("ABC2345"), false);
  assert.equal(isValidCode(""), false);
});
