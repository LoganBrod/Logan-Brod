/**
 * Tests for the open-questions parser.
 *
 * The fenced-code case is here because it was a live bug: memory/
 * open-questions.md documents its own format with an example item inside a
 * ``` fence, and the parser counted that example as a real open question.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { parseOpenQuestions } = await import("./memory.js");

test("returns unresolved items only", () => {
  const md = [
    "- [ ] first",
    "- [x] done",
    "- [X] also done",
    "- [ ] second",
  ].join("\n");

  assert.deepEqual(
    parseOpenQuestions(md).map((q) => q.question),
    ["first", "second"],
  );
});

test("ignores checklist items inside fenced code blocks", () => {
  const md = [
    "# Open Questions",
    "",
    "Format:",
    "",
    "```",
    "- [ ] YYYY-MM-DD — <the question>",
    "```",
    "",
    "- [ ] a real question",
  ].join("\n");

  const found = parseOpenQuestions(md);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.question, "a real question");
});

test("handles ~~~ fences too", () => {
  const md = ["~~~", "- [ ] template", "~~~", "- [ ] real"].join("\n");
  assert.deepEqual(
    parseOpenQuestions(md).map((q) => q.question),
    ["real"],
  );
});

test("attaches indented detail lines to their question", () => {
  const md = [
    "- [ ] why is this slow",
    "  **Context:** it takes 9s",
    "  more detail",
    "",
    "- [ ] unrelated",
  ].join("\n");

  const [first] = parseOpenQuestions(md);
  assert.deepEqual(first?.detail, ["**Context:** it takes 9s", "more detail"]);
});

test("accepts -, * and + bullets and stray indentation", () => {
  const md = ["* [ ] star", "+ [ ] plus", "   - [ ] indented"].join("\n");
  assert.equal(parseOpenQuestions(md).length, 3);
});

test("reports 1-based line numbers", () => {
  const md = ["# Title", "", "- [ ] third line"].join("\n");
  assert.equal(parseOpenQuestions(md)[0]?.line, 3);
});

test("empty and prose-only input yield nothing, without throwing", () => {
  assert.deepEqual(parseOpenQuestions(""), []);
  assert.deepEqual(parseOpenQuestions("just prose\n\nmore prose"), []);
});
