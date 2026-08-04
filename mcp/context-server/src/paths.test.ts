/**
 * Tests for the path guard. Run with: npm test
 *
 * This is the file worth having tests for. Everything else in the server is
 * recoverable if it misbehaves; a hole here means the server reads or writes
 * arbitrary files on the machine.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "memtest-"));
fs.mkdirSync(path.join(scratch, "businesses"), { recursive: true });
fs.writeFileSync(path.join(scratch, "businesses", "acme.md"), "# Acme\n");
process.env.MEMORY_DIR = scratch;

const { resolveInMemory, businessSlug, PathEscapeError, memoryRoot } =
  await import("./paths.js");

test("accepts paths inside memory/", () => {
  const p = resolveInMemory("businesses", "acme.md");
  assert.equal(p, path.join(scratch, "businesses", "acme.md"));
});

test("rejects relative traversal", () => {
  assert.throws(() => resolveInMemory("../../etc/passwd"), PathEscapeError);
  assert.throws(() => resolveInMemory("businesses/../../../x"), PathEscapeError);
});

test("rejects absolute paths", () => {
  // path.resolve discards everything before an absolute segment, so this
  // lands squarely outside the root.
  assert.throws(() => resolveInMemory("/etc/passwd"), PathEscapeError);
});

test("rejects a sibling directory sharing the root's name prefix", () => {
  // The case a naive startsWith() check gets wrong: "<root>-public" begins
  // with "<root>" as a string but is a different directory.
  const sibling = `${path.basename(scratch)}-public`;
  assert.throws(
    () => resolveInMemory("..", sibling, "secrets.md"),
    PathEscapeError,
  );
});

test("businessSlug normalises ordinary names", () => {
  assert.equal(businessSlug("Levoz"), "levoz");
  assert.equal(businessSlug("  Acme Widgets  "), "acme-widgets");
});

test("businessSlug rejects anything that could express a path", () => {
  for (const bad of [
    "../etc/passwd",
    "a/b",
    "a\\b",
    ".hidden",
    "",
    "..",
    "name.with.dots",
  ]) {
    assert.throws(() => businessSlug(bad), /Invalid business name/, `"${bad}"`);
  }
});

test("MEMORY_DIR override is honoured", () => {
  assert.equal(memoryRoot(), path.resolve(scratch));
});

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
