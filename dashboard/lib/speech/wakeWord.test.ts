/**
 * Tests for wake-word matching. Run with: npm test
 *
 * The matcher is the piece worth testing here. Too strict and the wake word
 * feels broken; too loose and the assistant interrupts conversations it was
 * never addressed in. Both failure modes are behavioural rather than
 * crash-shaped, so nothing else would catch a regression.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { matchWakeWord } from "./wakeWord.ts";

test("matches the plain wake word with a command", () => {
  const { matched, command } = matchWakeWord("Jarvis what are my open questions");
  assert.equal(matched, true);
  assert.equal(command, "what are my open questions");
});

test("matches with punctuation and mixed case", () => {
  const { matched, command } = matchWakeWord("JARVIS, what's my bottleneck?");
  assert.equal(matched, true);
  assert.equal(command, "what's my bottleneck");
});

test("matches common prefixes", () => {
  for (const phrase of ["hey Jarvis show projects", "OK Jarvis show projects"]) {
    const { matched, command } = matchWakeWord(phrase);
    assert.equal(matched, true, phrase);
    assert.equal(command, "show projects", phrase);
  }
});

test("tolerates how Whisper actually spells it", () => {
  // Whisper has no context for a name and renders it inconsistently. Exact
  // matching would make the wake word fail a large fraction of the time.
  for (const heard of ["Jervis time", "Javis time", "Jarviss time"]) {
    assert.equal(matchWakeWord(heard).matched, true, heard);
  }
});

test("a bare wake word matches with an empty command", () => {
  const { matched, command } = matchWakeWord("Jarvis");
  assert.equal(matched, true);
  assert.equal(command, "");
});

test("does not fire when the name appears mid-sentence", () => {
  // The false positive people find genuinely unnerving: an assistant that
  // joins a conversation about it.
  assert.equal(
    matchWakeWord("I was telling Dave about Jarvis yesterday").matched,
    false,
  );
  assert.equal(matchWakeWord("the movie has Jarvis in it").matched, false);
});

test("does not fire on unrelated speech", () => {
  for (const phrase of [
    "what time is it",
    "can you pass me the charger",
    "service is down again",
    "",
  ]) {
    assert.equal(matchWakeWord(phrase).matched, false, phrase);
  }
});

test("does not fire on merely similar words", () => {
  // "Jarvis" is 6 letters; these are close but should not wake it.
  for (const phrase of ["Harvey is coming", "carbis", "marvellous"]) {
    assert.equal(matchWakeWord(phrase).matched, false, phrase);
  }
});
