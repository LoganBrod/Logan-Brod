# Learner profile

calibrated: yes

## Levels

| Area | Level | Last assessed |
|---|---|---|
| Reading code | 1 | 2026-08-30 |
| HTML/CSS | 1 | 2026-08-30 |
| JavaScript | 1 | 2026-08-30 |
| Debugging | 2 | 2026-08-30 |
| Concepts | 3 | 2026-08-30 |

Calibrated on comment-stripped snippets from this repo. The comments here explain
*why* code is the way it is, so leaving them in would have measured reading
comprehension and inflated every level.

## Prediction record

Predictions made before a change, and whether they were right.
A rising hit rate is the main evidence this is working.

| Date | Change | Prediction | Right? |
|---|---|---|---|

Running: 0 / 0

## How I tend to fail

Four patterns, all seen more than once during calibration.

1. **I answer from around the code, not from the code.** Across the first four
   questions I used, in turn: the scenario Claude described, the number of items
   in the example, my memory of the live site, and the English inside the
   function names. I did not touch a single operator. Names go stale and stories
   are just stories; the code is the only thing that is actually true.

2. **When the code contradicts what I expect, the expectation wins.** `flex-col`
   I read as "even more side-by-side" because I'd just learned flex means
   side-by-side. `Math.max(peak, raw)` I read as keeping the bar accurate,
   because that's what a progress bar is supposed to do. Both times the code said
   the opposite and I overrode it.

3. **Being told a rule doesn't make it stick.** Mobile-first breakpoints were
   explained to me and I applied the opposite four messages later. Same with
   `room-ink` flipping - I had the fact in front of me and didn't use it. I need
   to *use* a rule before it holds, not hear it.

4. **I answer half of a two-part question.** Asked for a value, gave a purpose.
   Asked for phone and laptop, gave one number. Asked what's wrong and what I'd
   change, gave only what's wrong. Three times. This costs nothing now and will
   cost an interview.

## Starting strengths

Concepts is genuinely ahead of the rest and the gap is wide. On the category-cap
question I got there in one word, and on the follow-up I noticed the answer was
conditional on the `intent` parameter - a dependency the question never mentioned.
Spotting that a question has a hidden condition is a better skill than answering
the question, and it wasn't prompted.

I also flagged twice, unprompted, that an answer of mine was contaminated - once
by Claude's own explanation, once by my memory of the site - and asked for a
cleaner question rather than banking the point. Keep doing that.

The read: I can reason about systems well above my ability to read the syntax
they're written in. That's an unusual shape and a good one to have, because the
reasoning is the harder half to teach. The syntax is a grind that ends.
