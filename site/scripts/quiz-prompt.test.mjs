// The "take the quiz" button and the runner that answers it.
//
//   npm test
//
// A static test, like spend-guard, and for the same reason: the bug it guards
// against is invisible in review and silent in production.
//
// The button used to be a link to /closet?quiz=1. The parameter is read once,
// in the runner's mount effect. Clicking a link to the page you are already on
// is a soft navigation - the address changes, React keeps the runner mounted,
// the effect never runs again, and nothing happens. It worked from the front
// page, where the navigation is real, and did nothing at all on the page the
// button actually lives on.
//
// The two halves now agree through a cancellable event. Either half removed on
// its own puts the button back to doing nothing, so both are asserted here.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../app/components/${p}`, import.meta.url), "utf8");
const prompt = read("QuizPrompt.tsx");
const runner = read("StyleRunner.tsx");
const steps = read("HowItWorks.tsx");

test("the button asks, rather than navigating to the page it is already on", () => {
  assert.match(prompt, /clozet:quiz/, "the prompt must dispatch the event");
  assert.match(prompt, /cancelable:\s*true/, "cancellable, or the acknowledgement cannot work");
});

test("the runner is listening, and says so", () => {
  assert.match(runner, /addEventListener\("clozet:quiz"/, "the runner must listen");
  assert.match(runner, /removeEventListener\("clozet:quiz"/, "and clean up after itself");
  // preventDefault is the acknowledgement the prompt reads to know somebody
  // was there. Without it the prompt navigates and the soft-navigation bug
  // comes straight back.
  const handler = runner.slice(runner.indexOf('const onAsk'), runner.indexOf('window.addEventListener("clozet:quiz"'));
  assert.match(handler, /preventDefault\(\)/, "the handler must acknowledge the event");
  assert.match(handler, /setQuiz\(true\)/, "and actually open the quiz");
});

test("there is still a fallback for a page with no runner on it", () => {
  // The prompt renders wherever the steps do. If that is ever a page without
  // the runner, pressing it must still get somebody to the quiz.
  assert.match(prompt, /\/closet\?quiz=1/, "must fall back to navigating");
});

test("the steps render the prompt above them, and only above the form", () => {
  assert.match(steps, /<QuizPrompt \/>/);
  assert.match(steps, /\{top && <QuizPrompt \/>\}/, "bottom placement must not repeat the offer");
});

test("the swipe count the button promises is the one the quiz deals", async () => {
  // "15-swipe" is a claim about behaviour, so it comes from the constant that
  // governs it rather than from somebody's memory.
  const { CARDS } = await import("../lib/calibration.ts");
  assert.match(prompt, new RegExp(`${CARDS}-swipe`), `the quiz deals ${CARDS} cards`);
});
