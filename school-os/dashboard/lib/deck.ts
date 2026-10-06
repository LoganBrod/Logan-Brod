// Flashcard deck parsing. No server-only import: the Desk renders decks in the browser.
/** Parse a Spaced Repetition deck into cards. Supports "Q::A" and multi-line "Q\n?\nA". */
export function parseDeck(body: string): { q: string; a: string }[] {
  const cards: { q: string; a: string }[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.trim().split("\n").filter((l) => !l.startsWith("#flashcards"));
    if (!lines.length) continue;
    const q = lines.findIndex((l) => l.trim() === "?");
    if (q > 0) cards.push({ q: lines.slice(0, q).join("\n"), a: lines.slice(q + 1).join("\n") });
    else for (const l of lines) { const i = l.indexOf("::"); if (i > 0) cards.push({ q: l.slice(0, i).trim(), a: l.slice(i + 2).trim() }); }
  }
  return cards;
}
